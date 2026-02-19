import { Message, Modal, Notification } from "@arco-design/web-react"

import { addCategory, deleteCategory, updateCategory } from "@/apis/categories"
import { deleteFeed } from "@/apis/feeds"
import { polyglotState } from "@/hooks/useLanguage"
import { setCategoriesData, setFeedsData, feedsGroupedByIdState } from "@/store/dataState"

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

      // 更新属于该分组的订阅源
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

      // 更新分组列表
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

  // 删除分组下的所有订阅源（级联删除，同步到 Miniflux 后端）
  const deleteFeedsInCategory = async (categoryId) => {
    const feedsGroupedById = feedsGroupedByIdState.get()
    const feedsInCategory = feedsGroupedById[categoryId] || []

    if (feedsInCategory.length === 0) {
      return true
    }

    // 逐个删除分组下的订阅源
    const deletePromises = feedsInCategory.map(async (feed) => {
      try {
        await deleteFeed(feed.id)
        return { success: true, feedId: feed.id }
      } catch (error) {
        console.error(`删除订阅源失败: ${feed.title}`, error)
        return { success: false, feedId: feed.id, error }
      }
    })

    const results = await Promise.all(deletePromises)
    const failedDeletes = results.filter((r) => !r.success)

    if (failedDeletes.length > 0) {
      console.error(`${failedDeletes.length} 个订阅源删除失败`)
      return false
    }

    // 从前端 store 中移除已删除的订阅源
    const deletedFeedIds = feedsInCategory.map((f) => f.id)
    setFeedsData((prevFeeds) => prevFeeds.filter((feed) => !deletedFeedIds.includes(feed.id)))

    return true
  }

  const deleteCategoryDirectly = async (category) => {
    try {
      // 获取分组下的订阅源信息
      const feedsGroupedById = feedsGroupedByIdState.get()
      const feedsInCategory = feedsGroupedById[category.id] || []

      // 如果分组下有订阅源，先级联删除所有订阅源
      if (feedsInCategory.length > 0) {
        const feedsDeleted = await deleteFeedsInCategory(category.id)
        if (!feedsDeleted) {
          showMessage(
            `删除分组 "${category.title}" 下的订阅源时出错`,
            "error",
          )
          return false
        }
      }

      // 删除分组（此时分组已为空）
      const response = await deleteCategory(category.id)
      if (response.status === 204) {
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
    if (requireConfirmation) {
      // 获取分组下的订阅源数量，用于提示信息
      const feedsGroupedById = feedsGroupedByIdState.get()
      const feedsInCategory = feedsGroupedById[category.id] || []
      const feedCount = feedsInCategory.length

      // 根据是否有订阅源显示不同的确认信息
      const confirmContent =
        feedCount > 0
          ? `确定要删除分组 "${category.title}" 吗？该分组下有 ${feedCount} 个订阅源，将会被一并删除且无法恢复。`
          : polyglot.t("sidebar.delete_category_confirm_content", {
              title: category.title,
            })

      Modal.confirm({
        title: polyglot.t("sidebar.delete_category_confirm_title"),
        content: confirmContent,
        onOk: () => deleteCategoryDirectly(category),
      })
    } else {
      return deleteCategoryDirectly(category)
    }
  }

  return {
    addNewCategory,
    editCategory,
    deleteCategoryDirectly,
    handleDeleteCategory,
  }
}

export default useCategoryOperations
