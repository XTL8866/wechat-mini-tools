App({
  onLaunch: function () {
    // 纯本地工具，无需登录、无网络请求。
    // 仅记一次启动时间，用于「最近使用」体验优化，不采集任何个人信息。
    try {
      wx.setStorageSync('gridcut_last_open', Date.now());
    } catch (e) {}
  }
});
