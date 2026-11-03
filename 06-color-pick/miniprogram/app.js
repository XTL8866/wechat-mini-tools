App({
  onLaunch: function () {
    // 纯本地工具，无需登录、无网络请求。
    // 只记一次启动时间，用于「上次取色」的排序体验，不采集任何个人信息。
    try {
      wx.setStorageSync('cp_last_open', Date.now());
    } catch (e) {}
  }
});
