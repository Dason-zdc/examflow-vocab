/**
 * 换卡后把视口带回卡片顶部。
 * 背面读到底部再点「下一个」时，新卡片会从页面中部开始渲染，
 * 用户必须手动上滑才能看到词头——这里统一复位。
 * jsdom 未实现 scrollTo/scrollIntoView，全部走 try/catch 容错。
 */
export function scrollToStudyTop(): void {
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    // 旧浏览器或测试环境：忽略，不影响换卡
  }
}
