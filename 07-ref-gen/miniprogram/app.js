App({
  onLaunch: function () {
    // 纯本地工具，无需登录、无网络请求。
    // 只记一次启动时间，用于列表排序的默认项，不采集任何个人信息。
    try {
      wx.setStorageSync('rf_last_open', Date.now());
    } catch (e) {}
  }
});
