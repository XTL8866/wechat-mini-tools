App({
  onLaunch: function () {
    // 纯本地工具，无登录、无网络请求。
    // 只记一个打开时间，不采集任何个人信息。
    try {
      wx.setStorageSync('wh_last_open', Date.now());
    } catch (e) {}
  }
});
