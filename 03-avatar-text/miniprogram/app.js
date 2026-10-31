App({
  onLaunch: function () {
    // 纯本地工具，无需登录、无网络请求。
    // 仅记录一次启动，用于「最近使用」体验优化，不采集任何个人信息。
    try {
      var k = 'at_last_open';
      wx.setStorageSync(k, Date.now());
    } catch (e) {}
  }
});
