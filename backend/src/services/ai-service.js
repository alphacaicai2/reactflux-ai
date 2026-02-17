import { decrypt } from '../utils/encryption.js';
import { getProviderPreset } from '../utils/config.js';

/**
 * Build request headers based on provider
 * @param {string} provider - Provider ID
 * @param {string} apiKey - Decrypted API key
 * @returns {object} - Headers object
 */
function buildHeaders(provider, apiKey) {
  const baseHeaders = {
    'Content-Type': 'application/json'
  };

  switch (provider) {
    case 'anthropic':
      return {
        ...baseHeaders,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      };

    case 'google':
      // Google uses API key in query param, but we'll handle it in URL
      return baseHeaders;

    case 'openrouter':
      return {
        ...baseHeaders,
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'ReactFlux AI'
      };

    default:
      // OpenAI-compatible providers
      return {
        ...baseHeaders,
        'Authorization': `Bearer ${apiKey}`
      };
  }
}

/**
 * Build request body based on provider
 * @param {string} provider - Provider ID
 * @param {object} params - Chat parameters
 * @returns {object} - Request body
 */
function buildRequestBody(provider, params) {
  const { messages, model, stream = true, ...extraParams } = params;

  // Base body for OpenAI-compatible APIs
  const baseBody = {
    model,
    messages,
    stream,
    ...extraParams
  };

  // Provider-specific modifications
  switch (provider) {
    case 'anthropic':
      // Anthropic uses different format
      return {
        model,
        messages: messages.map(msg => {
          // Handle role mapping for Anthropic
          if (msg.role === 'system') {
            return { role: 'user', content: msg.content };
          }
          return msg;
        }),
        max_tokens: extraParams.max_tokens || 4096,
        stream
      };

    case 'google':
      // Google uses different endpoint structure
      // Will be handled in the request URL
      return {
        contents: messages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          maxOutputTokens: extraParams.max_tokens || 8192
        }
      };

    default:
      return baseBody;
  }
}

/**
 * Build API endpoint URL based on provider
 * @param {string} provider - Provider ID
 * @param {string} apiUrl - Base API URL
 * @param {string} model - Model name
 * @param {string} apiKey - API key (for Google)
 * @returns {string} - Full endpoint URL
 */
function buildEndpointUrl(provider, apiUrl, model, apiKey) {
  // Remove trailing slash
  const baseUrl = apiUrl.replace(/\/$/, '');

  switch (provider) {
    case 'anthropic':
      return `${baseUrl}/messages`;

    case 'google':
      return `${baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    default:
      // OpenAI-compatible endpoints
      return `${baseUrl}/chat/completions`;
  }
}

/**
 * Test AI connection by making a simple request
 * @param {object} config - AI configuration
 * @returns {Promise<object>} - Test result
 */
export async function testConnection(config) {
  const { provider, apiUrl, apiKeyEncrypted, api_key_encrypted, model } = config;
  const encryptedKey = apiKeyEncrypted || api_key_encrypted;

  try {
    const apiKey = decrypt(encryptedKey);
    const preset = getProviderPreset(provider);

    if (!preset) {
      return { success: false, error: `Unknown provider: ${provider}` };
    }

    const headers = buildHeaders(provider, apiKey);
    const endpoint = buildEndpointUrl(provider, apiUrl || preset.apiUrl, model || preset.defaultModel, apiKey);

    // Simple test message
    const testBody = buildRequestBody(provider, {
      messages: [{ role: 'user', content: 'Hi' }],
      model: model || preset.defaultModel,
      stream: false,
      max_tokens: 10
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(testBody)
    });

    if (response.ok) {
      return { success: true, message: 'Connection successful' };
    } else {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        // Use text error if JSON parsing fails
        errorMessage = errorText || errorMessage;
      }

      return { success: false, error: errorMessage };
    }
  } catch (error) {
    console.error('Connection test error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Proxy chat request to AI provider with streaming support
 * @param {object} config - AI configuration
 * @param {object} params - Chat parameters
 * @param {ReadableStreamDefaultController} controller - Stream controller for SSE
 * @returns {Promise<void>}
 */
export async function proxyChatRequest(config, params, controller) {
  const { provider, apiUrl, apiKeyEncrypted, api_key_encrypted } = config;
  const { model, messages, stream = true, ...extraParams } = params;
  const encryptedKey = apiKeyEncrypted || api_key_encrypted;

  try {
    const apiKey = decrypt(encryptedKey);
    const preset = getProviderPreset(provider);

    if (!preset) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const headers = buildHeaders(provider, apiKey);
    const endpoint = buildEndpointUrl(provider, apiUrl || preset.apiUrl, model, apiKey);
    const body = buildRequestBody(provider, { model, messages, stream, ...extraParams });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        // Use text error if JSON parsing fails
      }

      throw new Error(errorMessage);
    }

    if (stream) {
      // Stream response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            break;
          }

          const chunk = decoder.decode(value, { stream: true });

          // Process the chunk based on provider format
          const processedChunk = processStreamChunk(provider, chunk);

          if (processedChunk) {
            controller.enqueue(encoder.encode(processedChunk));
          }
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      // Non-streaming response
      const data = await response.json();
      const encoder = new TextEncoder();

      // Format as SSE for consistency
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    }
  } catch (error) {
    console.error('Chat proxy error:', error);
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
  }
}

/**
 * Process stream chunk based on provider format
 * @param {string} provider - Provider ID
 * @param {string} chunk - Raw chunk from response
 * @returns {string|null} - Processed chunk in OpenAI format or null
 */
function processStreamChunk(provider, chunk) {
  const lines = chunk.split('\n').filter(line => line.trim() !== '');

  let result = '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);

      if (data === '[DONE]') {
        result += 'data: [DONE]\n\n';
        continue;
      }

      try {
        const parsed = JSON.parse(data);

        // Convert provider-specific format to OpenAI format
        const converted = convertToOpenAIFormat(provider, parsed);

        if (converted) {
          result += `data: ${JSON.stringify(converted)}\n\n`;
        }
      } catch {
        // If parsing fails, pass through as-is
        result += `${line}\n\n`;
      }
    } else {
      // Non-SSE format (some providers might use this)
      result += `data: ${line}\n\n`;
    }
  }

  return result || null;
}

/**
 * Convert provider-specific response to OpenAI format
 * @param {string} provider - Provider ID
 * @param {object} data - Parsed response data
 * @returns {object|null} - OpenAI-formatted response or null
 */
function convertToOpenAIFormat(provider, data) {
  switch (provider) {
    case 'anthropic':
      // Convert Anthropic format to OpenAI
      if (data.type === 'content_block_delta') {
        return {
          id: data.id || 'chatcmpl-anthropic',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: data.model || 'claude',
          choices: [{
            index: 0,
            delta: { content: data.delta?.text || '' },
            finish_reason: null
          }]
        };
      } else if (data.type === 'message_stop') {
        return {
          id: 'chatcmpl-anthropic',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'claude',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }]
        };
      }
      return null;

    case 'google':
      // Convert Google format to OpenAI
      if (data.candidates) {
        const candidate = data.candidates[0];
        const text = candidate.content?.parts?.[0]?.text || '';

        return {
          id: 'chatcmpl-google',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gemini',
          choices: [{
            index: 0,
            delta: { content: text },
            finish_reason: candidate.finishReason === 'STOP' ? 'stop' : null
          }]
        };
      }
      return null;

    default:
      // Already in OpenAI format
      return data;
  }
}

export default {
  testConnection,
  proxyChatRequest
};
