import { Hono } from 'hono';
import db from '../db/index.js';
import { encrypt, maskApiKey } from '../utils/encryption.js';
import { getProviderList, getProviderPreset, validateProviderConfig } from '../utils/config.js';
import { testConnection, proxyChatRequest } from '../services/ai-service.js';

const ai = new Hono();

/**
 * GET /api/ai/providers
 * Get list of all supported AI providers with their presets
 */
ai.get('/providers', (c) => {
  const providers = getProviderList();
  return c.json({ success: true, data: providers });
});

/**
 * GET /api/ai/config
 * Get AI configuration (API Key is masked)
 */
ai.get('/config', (c) => {
  try {
    // Get all configurations
    const configs = db.prepare(`
      SELECT id, provider, api_url, api_key_encrypted, model, extra_config, is_active, created_at, updated_at
      FROM ai_config
      ORDER BY provider
    `).all();

    // Mask API keys and parse extra_config
    const maskedConfigs = configs.map(config => ({
      ...config,
      apiKey: maskApiKey(config.api_key_encrypted),
      apiKeyEncrypted: undefined,
      api_key_encrypted: undefined,
      extraConfig: config.extra_config ? JSON.parse(config.extra_config) : {},
      extra_config: undefined
    }));

    return c.json({ success: true, data: maskedConfigs });
  } catch (error) {
    console.error('Error fetching AI config:', error);
    return c.json({ success: false, error: 'Failed to fetch configuration' }, 500);
  }
});

/**
 * GET /api/ai/config/:provider
 * Get configuration for a specific provider
 */
ai.get('/config/:provider', (c) => {
  try {
    const provider = c.req.param('provider');
    const preset = getProviderPreset(provider);

    if (!preset) {
      return c.json({ success: false, error: `Unknown provider: ${provider}` }, 400);
    }

    const config = db.prepare(`
      SELECT id, provider, api_url, api_key_encrypted, model, extra_config, is_active, created_at, updated_at
      FROM ai_config
      WHERE provider = ?
    `).get(provider);

    if (!config) {
      // Return preset as default
      return c.json({
        success: true,
        data: {
          provider,
          apiUrl: preset.apiUrl,
          apiKey: null,
          model: preset.defaultModel,
          extraConfig: {},
          isActive: false
        }
      });
    }

    return c.json({
      success: true,
      data: {
        ...config,
        apiKey: maskApiKey(config.api_key_encrypted),
        apiKeyEncrypted: undefined,
        api_key_encrypted: undefined,
        extraConfig: config.extra_config ? JSON.parse(config.extra_config) : {},
        extra_config: undefined
      }
    });
  } catch (error) {
    console.error('Error fetching provider config:', error);
    return c.json({ success: false, error: 'Failed to fetch configuration' }, 500);
  }
});

/**
 * POST /api/ai/config
 * Save AI configuration (API Key is encrypted)
 */
ai.post('/config', async (c) => {
  try {
    const body = await c.req.json();
    const { provider, apiUrl, apiKey, model, extraConfig, isActive } = body;

    // Validate
    const preset = getProviderPreset(provider);
    if (!preset) {
      return c.json({ success: false, error: `Unknown provider: ${provider}` }, 400);
    }

    // Validate configuration if API key is provided
    if (apiKey) {
      const validation = validateProviderConfig(provider, { apiUrl, apiKey });
      if (!validation.valid) {
        return c.json({ success: false, errors: validation.errors }, 400);
      }
    }

    // Encrypt API key if provided
    const apiKeyEncrypted = apiKey ? encrypt(apiKey) : null;
    const finalApiUrl = apiUrl || preset.apiUrl;
    const finalModel = model || preset.defaultModel;
    const extraConfigJson = extraConfig ? JSON.stringify(extraConfig) : null;

    // Upsert configuration
    const stmt = db.prepare(`
      INSERT INTO ai_config (provider, api_url, api_key_encrypted, model, extra_config, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider) DO UPDATE SET
        api_url = excluded.api_url,
        api_key_encrypted = COALESCE(excluded.api_key_encrypted, api_key_encrypted),
        model = excluded.model,
        extra_config = excluded.extra_config,
        is_active = excluded.is_active,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      provider,
      finalApiUrl,
      apiKeyEncrypted,
      finalModel,
      extraConfigJson,
      isActive ? 1 : 0
    );

    return c.json({
      success: true,
      data: {
        provider,
        apiUrl: finalApiUrl,
        model: finalModel,
        apiKey: maskApiKey(apiKeyEncrypted),
        isActive: !!isActive
      }
    });
  } catch (error) {
    console.error('Error saving AI config:', error);
    return c.json({ success: false, error: 'Failed to save configuration' }, 500);
  }
});

/**
 * DELETE /api/ai/config/:provider
 * Delete configuration for a specific provider
 */
ai.delete('/config/:provider', (c) => {
  try {
    const provider = c.req.param('provider');

    const result = db.prepare('DELETE FROM ai_config WHERE provider = ?').run(provider);

    if (result.changes === 0) {
      return c.json({ success: false, error: 'Configuration not found' }, 404);
    }

    return c.json({ success: true, message: 'Configuration deleted' });
  } catch (error) {
    console.error('Error deleting AI config:', error);
    return c.json({ success: false, error: 'Failed to delete configuration' }, 500);
  }
});

/**
 * POST /api/ai/test
 * Test AI connection
 */
ai.post('/test', async (c) => {
  try {
    const body = await c.req.json();
    const { provider, apiUrl, apiKey, model } = body;

    // If API key provided in request, use it directly
    // Otherwise, look up from database
    let configToTest;

    if (apiKey) {
      // Test with provided credentials
      const preset = getProviderPreset(provider);
      if (!preset) {
        return c.json({ success: false, error: `Unknown provider: ${provider}` }, 400);
      }

      configToTest = {
        provider,
        apiUrl: apiUrl || preset.apiUrl,
        apiKeyEncrypted: encrypt(apiKey),
        model: model || preset.defaultModel
      };
    } else {
      // Get from database
      const dbConfig = db.prepare(`
        SELECT provider, api_url, api_key_encrypted, model
        FROM ai_config
        WHERE provider = ?
      `).get(provider);

      if (!dbConfig || !dbConfig.api_key_encrypted) {
        return c.json({
          success: false,
          error: 'No configuration found for this provider. Please save configuration first.'
        }, 400);
      }

      configToTest = dbConfig;
    }

    const result = await testConnection(configToTest);

    return c.json(result);
  } catch (error) {
    console.error('Error testing connection:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/ai/chat
 * Proxy chat request to AI provider with streaming support
 */
ai.post('/chat', async (c) => {
  try {
    const body = await c.req.json();
    const { provider, messages, model, stream = true, ...extraParams } = body;

    // Validate required fields
    if (!provider) {
      return c.json({ success: false, error: 'Provider is required' }, 400);
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ success: false, error: 'Messages are required' }, 400);
    }

    // Get configuration from database
    const config = db.prepare(`
      SELECT provider, api_url, api_key_encrypted, model
      FROM ai_config
      WHERE provider = ?
    `).get(provider);

    if (!config || !config.api_key_encrypted) {
      return c.json({
        success: false,
        error: 'No configuration found for this provider. Please configure the provider first.'
      }, 400);
    }

    // Use model from request or default from config
    const finalModel = model || config.model;

    if (stream) {
      // Return SSE stream
      const stream = new ReadableStream({
        async start(controller) {
          try {
            await proxyChatRequest(
              config,
              { model: finalModel, messages, stream: true, ...extraParams },
              controller
            );
            controller.close();
          } catch (error) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      // Non-streaming response
      const chunks = [];
      const mockController = {
        enqueue: (data) => {
          const decoder = new TextDecoder();
          const text = decoder.decode(data);
          chunks.push(text);
        }
      };

      await proxyChatRequest(
        config,
        { model: finalModel, messages, stream: false, ...extraParams },
        mockController
      );

      // Parse the response
      const lastChunk = chunks.find(c => c.includes('[DONE]'));
      const dataMatch = chunks.join('').match(/data: ({.*?})\n\n/);

      if (dataMatch) {
        return c.json(JSON.parse(dataMatch[1]));
      }

      return c.json({ success: true, data: chunks });
    }
  } catch (error) {
    console.error('Error in chat proxy:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default ai;
