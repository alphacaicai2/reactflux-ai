import { Button, Notification, Typography } from "@arco-design/web-react"
import { IconEmpty, IconLeft, IconRight } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { AnimatePresence } from "framer-motion"
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useParams } from "react-router"
import { useSwipeable } from "react-swipeable"

import FooterPanel from "./FooterPanel"

import { getEntry } from "@/apis"
import ActionButtons from "@/components/Article/ActionButtons"
import ArticleDetail from "@/components/Article/ArticleDetail"
import ArticleList from "@/components/Article/ArticleList"
import SearchAndSortBar from "@/components/Article/SearchAndSortBar"
import FadeTransition from "@/components/ui/FadeTransition"
import useAppData from "@/hooks/useAppData"
import useArticleAI from "@/hooks/useArticleAI"
import useArticleList from "@/hooks/useArticleList"
import useContentContext from "@/hooks/useContentContext"
import useContentHotkeys from "@/hooks/useContentHotkeys"
import useDocumentTitle from "@/hooks/useDocumentTitle"
import useKeyHandlers from "@/hooks/useKeyHandlers"
import { polyglotState } from "@/hooks/useLanguage"
import useScreenWidth from "@/hooks/useScreenWidth"
import {
  contentState,
  setActiveContent,
  setInfoFrom,
  setInfoId,
  setIsArticleLoading,
} from "@/store/contentState"
import { dataState } from "@/store/dataState"
import { duplicateHotkeysState } from "@/store/hotkeysState"
import { settingsState, updateSettings } from "@/store/settingsState"

import "./Content.css"

const Content = ({ info, getEntries, markAllAsRead }) => {
  const { activeContent, entries, filterDate, filterString, isArticleLoading } =
    useStore(contentState)
  const { isAppDataReady } = useStore(dataState)
  const { enableSwipeGesture, entryListWidth, orderBy, orderDirection, showStatus, swipeSensitivity } =
    useStore(settingsState)
  const { polyglot } = useStore(polyglotState)
  const duplicateHotkeys = useStore(duplicateHotkeysState)

  const [isSwipingLeft, setIsSwipingLeft] = useState(false)
  const [isSwipingRight, setIsSwipingRight] = useState(false)
  const [resizeWidth, setResizeWidth] = useState(null)
  const cardsRef = useRef(null)
  const panelsRef = useRef(null)
  const resizeStartRef = useRef(null)
  const resizeCurrentRef = useRef(null)
  const [isResizing, setIsResizing] = useState(false)

  const location = useLocation()
  const params = useParams()

  useDocumentTitle()

  const { entryDetailRef, entryListRef, handleEntryClick } = useContentContext()

  const { navigateToNextArticle, navigateToPreviousArticle, showHotkeysSettings } = useKeyHandlers()

  const articleAI = useArticleAI(activeContent || null)
  const { fetchAppData, fetchFeedRelatedData } = useAppData()
  const { fetchArticleList } = useArticleList(info, getEntries)
  const { isBelowMedium } = useScreenWidth()

  const fetchArticleListOnly = async () => {
    await (isAppDataReady ? fetchArticleList(getEntries) : fetchAppData())
  }

  const fetchArticleListWithRelatedData = async () => {
    await (isAppDataReady
      ? Promise.all([fetchArticleList(getEntries), fetchFeedRelatedData()])
      : fetchAppData())
  }

  const fetchSingleEntry = async (entryId) => {
    const existingEntry = entries.find((entry) => entry.id === Number(entryId))

    if (existingEntry) {
      setActiveContent(existingEntry)
      return
    }

    try {
      setIsArticleLoading(true)
      const entry = await getEntry(entryId)
      setActiveContent(entry)
    } catch (error) {
      console.error("Failed to fetch entry:", error)
    } finally {
      setIsArticleLoading(false)
    }
  }

  useContentHotkeys({ handleRefreshArticleList: fetchArticleListWithRelatedData })

  const handleSwiping = (eventData) => {
    setIsSwipingLeft(eventData.dir === "Left")
    setIsSwipingRight(eventData.dir === "Right")
  }

  const handleSwiped = () => {
    setIsSwipingLeft(false)
    setIsSwipingRight(false)
  }

  const handleSwipeLeft = useCallback(() => navigateToNextArticle(), [navigateToNextArticle])

  const handleSwipeRight = useCallback(
    () => navigateToPreviousArticle(),
    [navigateToPreviousArticle],
  )

  const handlers = useSwipeable({
    delta: 50 / swipeSensitivity,
    onSwiping: enableSwipeGesture
      ? (eventData) => {
          if (globalThis.getSelection().toString()) {
            return
          }
          handleSwiping(eventData)
        }
      : undefined,
    onSwiped: enableSwipeGesture ? handleSwiped : undefined,
    onSwipedLeft: enableSwipeGesture ? handleSwipeLeft : undefined,
    onSwipedRight: enableSwipeGesture ? handleSwipeRight : undefined,
  })

  useEffect(() => {
    if (duplicateHotkeys.length > 0) {
      const id = "duplicate-hotkeys"
      Notification.error({
        id,
        title: polyglot.t("settings.duplicate_hotkeys"),
        duration: 0,
        btn: (
          <span>
            <Button
              size="small"
              style={{ marginRight: 8 }}
              type="secondary"
              onClick={() => Notification.remove(id)}
            >
              {polyglot.t("actions.dismiss")}
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                showHotkeysSettings()
                Notification.remove(id)
              }}
            >
              {polyglot.t("actions.check")}
            </Button>
          </span>
        ),
      })
    }
  }, [duplicateHotkeys, polyglot, showHotkeysSettings])

  useEffect(() => {
    setInfoFrom(info.from)
    setInfoId(info.id)
    if (activeContent) {
      setActiveContent(null)
    }
    if (info.from === "category") {
      fetchArticleListWithRelatedData()
    } else {
      fetchArticleListOnly()
    }
  }, [info])

  useEffect(() => {
    if (["starred", "history"].includes(info.from)) {
      return
    }
    fetchArticleListOnly()
  }, [orderBy])

  useEffect(() => {
    fetchArticleListOnly()
  }, [filterDate, filterString, orderDirection, showStatus])

  useEffect(() => {
    if (isBelowMedium && activeContent) {
      const { entryId } = params
      if (!entryId) {
        setActiveContent(null)
      }
    }
  }, [location.pathname])

  useEffect(() => {
    const { entryId } = params
    if (entryId) {
      if (!activeContent || activeContent.id !== Number(entryId)) {
        fetchSingleEntry(entryId)
      }
    } else if (activeContent) {
      setActiveContent(null)
    }
  }, [params])

  useEffect(() => {
    if (!isResizing || !resizeStartRef.current) return
    const { startX, startWidth } = resizeStartRef.current
    resizeCurrentRef.current = startWidth
    const onMove = (e) => {
      const delta = e.clientX - startX
      const el = panelsRef.current
      const maxW = el ? Math.floor(el.getBoundingClientRect().width * 0.5) : Infinity
      const next = Math.min(Math.max(280, startWidth + delta), maxW)
      resizeCurrentRef.current = next
      setResizeWidth(next)
    }
    const onUp = () => {
      const w = resizeCurrentRef.current !== null ? resizeCurrentRef.current : startWidth
      updateSettings({ entryListWidth: w })
      setResizeWidth(null)
      resizeStartRef.current = null
      resizeCurrentRef.current = null
      setIsResizing(false)
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizing])

  const currentEntryWidth = resizeWidth !== null ? resizeWidth : entryListWidth
  const handleResizeStart = (e) => {
    e.preventDefault()
    resizeStartRef.current = { startX: e.clientX, startWidth: currentEntryWidth }
    setIsResizing(true)
  }

  return (
    <div
      ref={panelsRef}
      className="content-panels"
      style={{ "--entry-list-width": `${currentEntryWidth}px` }}
    >
      <div
        className="entry-col"
        style={{
          opacity: isBelowMedium && isArticleLoading ? 0 : 1,
        }}
      >
        <SearchAndSortBar />
        <ArticleList
          ref={entryListRef}
          cardsRef={cardsRef}
          getEntries={getEntries}
          handleEntryClick={handleEntryClick}
        />
        <FooterPanel
          info={info}
          markAllAsRead={markAllAsRead}
          refreshArticleList={fetchArticleListWithRelatedData}
        />
      </div>
      {!isBelowMedium && (
        <div
          className="resize-handle"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleResizeStart}
        />
      )}
      {activeContent ? (
        <div className="article-container content-wrapper" {...handlers}>
          {!isBelowMedium && <ActionButtons articleAI={articleAI} />}
          {isArticleLoading ? (
            <div style={{ flex: 1 }} />
          ) : (
            <>
              <AnimatePresence>
                {isSwipingRight && (
                  <FadeTransition key="swipe-hint-left" className="swipe-hint left">
                    <IconLeft style={{ fontSize: 24 }} />
                  </FadeTransition>
                )}
                {isSwipingLeft && (
                  <FadeTransition key="swipe-hint-right" className="swipe-hint right">
                    <IconRight style={{ fontSize: 24 }} />
                  </FadeTransition>
                )}
              </AnimatePresence>
              <ArticleDetail ref={entryDetailRef} articleAI={articleAI} />
            </>
          )}
          {isBelowMedium && <ActionButtons articleAI={articleAI} />}
        </div>
      ) : (
        <div className="content-empty content-wrapper">
          <IconEmpty style={{ fontSize: "64px" }} />
          <Typography.Title heading={6} style={{ color: "var(--color-text-3)", marginTop: "10px" }}>
            ReactFlux
          </Typography.Title>
        </div>
      )}
    </div>
  )
}

export default Content
