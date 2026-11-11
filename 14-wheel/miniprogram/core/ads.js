/**
 * 激励视频广告封装 —— 带降级放行
 *
 * 为什么必须降级：
 * 新小程序没有流量主权限（需累计独立访客 ≥1000），此时 adUnitId 填任何值
 * 都会触发 onError（1004 广告拉取失败）。如果严格拦截，用户点了解锁按钮
 * 什么都不会发生，看起来像坏了。
 *
 * 所以策略是：拉不到广告 → 视为解锁成功，照常放行。
 * 拿到流量主权限后，只需要改下面的 AD_UNIT_ID 常量，其余代码不用动。
 */

var AD_UNIT_ID = '';   // ← 拿到流量主后填这里，例如 'adunit-xxxxxxxxxxxxxxxx'

var _ad = null;
var _loaded = false;
var _failed = false;

function ensureAd() {
  if (_ad) return _ad;
  if (!AD_UNIT_ID) { _failed = true; return null; }
  if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) { _failed = true; return null; }

  try {
    _ad = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
    _ad.onLoad(function () { _loaded = true; _failed = false; });
    _ad.onError(function () { _failed = true; _loaded = false; });
    _ad.onClose(function (res) {
      var ok = res && (res.isEnded || res.isEnded === undefined);
      if (ok) _unlockCb && _unlockCb(true);
      else _unlockCb && _unlockCb(false);
      _unlockCb = null;
    });
  } catch (e) {
    _failed = true;
    _ad = null;
  }
  return _ad;
}

var _unlockCb = null;

/**
 * 展示激励视频，结束后回调。
 * @param {Object} handlers { onReward(noAd), onFail(reason) }
 *  - onReward 一定会在用户看完、或广告不可用时被调用（降级）
 *  - onFail 只在用户主动中途关闭时调用
 */
function show(handlers) {
  handlers = handlers || {};
  var ad = ensureAd();

  if (!ad) {
    // 无广告位 / 环境不支持 → 直接放行
    setTimeout(function () { handlers.onReward && handlers.onReward(true); }, 120);
    return;
  }

  _unlockCb = function (completed) {
    if (completed) handlers.onReward && handlers.onReward(false);
    else handlers.onFail && handlers.onFail('中途关闭了广告');
  };

  ad.show().catch(function () {
    ad.load()
      .then(function () { return ad.show(); })
      .catch(function () {
        // 拉了两次还是失败 → 降级放行，别卡住用户
        _unlockCb = null;
        handlers.onReward && handlers.onReward(true);
      });
  });
}

function isAvailable() {
  return !!AD_UNIT_ID && !_failed;
}

module.exports = { show: show, isAvailable: isAvailable, AD_UNIT_ID: AD_UNIT_ID };
