import { Button, Space, Typography } from "@arco-design/web-react"
import { IconPlus } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { useCallback, useState } from "react"

import { DigestGenerateModal, DigestList } from "@/components/Digest"
import { polyglotState } from "@/hooks/useLanguage"
import useModalToggle from "@/hooks/useModalToggle"

import "./Digest.css"

const { Title } = Typography

/**
 * Digest page - Main page for viewing digests
 */
const Digest = () => {
  const { polyglot } = useStore(polyglotState)
  const [refreshKey, setRefreshKey] = useState(0)

  // Handle generation complete
  const handleGenerateComplete = useCallback(() => {
    // Refresh the list
    setRefreshKey((prev) => prev + 1)
  }, [])

  return (
    <div className="digest-page">
      <DigestList key={refreshKey} />
    </div>
  )
}

export default Digest
