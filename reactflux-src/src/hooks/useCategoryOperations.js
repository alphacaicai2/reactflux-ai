import { Message, Modal, Notification } from "@arco-design/web-react"

import { addCategory, deleteCategory, getCategoryFeeds, updateCategory } from "@/apis/categories"
import { deleteFeed } from "@/apis/feeds"
import { polyglotState } from "@/hooks/useLanguage"
import { setCategoriesData, setFeedsData, setUnreadInfo } from "@/store/dataState"

const useCategoryOperations = (useNotification = false) => {
  const { polyglot } = polyglotState.get()

  const showMessage = (message, type = "success") => {
    if (useNotification) {
      Notification[type]({ title: message })
    } else {
      Message[type](message)
    }
  }

  const addNewCategory = async (title) => {
    if (!title?.trim()) {
      return false
    }

    try {
      const data = await addCategory(title.trim())
      setCategoriesData((prevCategories) => [...prevCategories, { ...data }])

      const successMessage = polyglot.t("category_list.add_category_success")
      showMessage(successMessage)
      return true
    } catch (error) {
      console.error(`${polyglot.t("category_list.add_category_error")}:`, error)

      const errorMessage = polyglot.t("category_list.add_category_error")
      showMessage(errorMessage, "error")
      return false
    }
  }

  const editCategory = async (categoryId, newTitle, hidden) => {
    try {
      const data = await updateCategory(categoryId, newTitle, hidden)

      // Update feeds that belong to this category
      setFeedsData((prevFeeds) =>
        prevFeeds.map((feed) =>
          feed.category.id === categoryId
            ? {
                ...feed,
                category: {
                  ...feed.category,
                  title: newTitle,
                  hide_globally: hidden,
                },
              }
            : feed,
        ),
      )

      // Update categories list
      setCategoriesData((prevCategories) =>
        prevCategories.map((category) =>
          category.id === categoryId ? { ...category, ...data } : category,
        ),
      )

      const successMessage = polyglot.t("category_list.update_category_success")
      showMessage(successMessage)
      return true
    } catch (error) {
      console.error("Failed to update category:", error)
      const errorMessage = polyglot.t("category_list.update_category_error")
      showMessage(errorMessage, "error")
      return false
    }
  }

  const removeUnreadInfoByFeedIds = (prevUnreadInfo, feedIdSet) =>
    Object.fromEntries(
      Object.entries(prevUnreadInfo).filter(([feedId]) => !feedIdSet.has(Number(feedId))),
    )

  const deleteCategoryDirectly = async (category) => {
    try {
      // 先获取分组内的所有订阅源
      const feedsInCategory = await getCategoryFeeds(category.id)

      // 并行删除所有订阅源
      const feedDeletionResults = await Promise.allSettled(
        feedsInCategory.map((feed) => deleteFeed(feed.id)),
      )

      // 检查是否有删除失败的订阅源
      const failedFeedCount = feedDeletionResults.filter(
        (result) => result.status === "rejected" || result.value?.status !== 204,
      ).length

      if (failedFeedCount > 0) {
        throw new Error(`Failed to delete ${failedFeedCount} feeds in category ${category.id}`)
      }

      // 删除分组
      const response = await deleteCategory(category.id)
      if (response.status === 204) {
        const deletedFeedIdSet = new Set(feedsInCategory.map((feed) => feed.id))

        // 同步更新本地状态
        setFeedsData((prevFeeds) =>
          prevFeeds.filter((feed) => !deletedFeedIdSet.has(feed.id)),
        )
        setUnreadInfo((prevUnreadInfo) =>
          removeUnreadInfoByFeedIds(prevUnreadInfo, deletedFeedIdSet),
        )
        setCategoriesData((prevCategories) => prevCategories.filter((c) => c.id !== category.id))

        const successMessage = polyglot.t("category_list.remove_category_success", {
          title: category.title,
        })
        showMessage(successMessage)
        return true
      } else {
        throw new Error(`Unexpected status: ${response.status}`)
      }
    } catch (error) {
      console.error(`Failed to delete category: ${category.title}`, error)

      const errorMessage = polyglot.t("category_list.remove_category_error", {
        title: category.title,
      })
      showMessage(errorMessage, "error")
      return false
    }
  }

  const handleDeleteCategory = async (category, requireConfirmation = true) => {
    if (!requireConfirmation) {
      return deleteCategoryDirectly(category)
    }

    return new Promise((resolve) => {
      Modal.confirm({
        title: polyglot.t("sidebar.delete_category_confirm_title"),
        content: polyglot.t("sidebar.delete_category_confirm_content", {
          title: category.title,
        }),
        onOk: async () => {
          const deleted = await deleteCategoryDirectly(category)
          resolve(deleted)
        },
        onCancel: () => resolve(false),
      })
    })
  }

  return {
    addNewCategory,
    editCategory,
    deleteCategoryDirectly,
    handleDeleteCategory,
  }
}

export default useCategoryOperations
