// ============================================================
//  占いシリーズ の設定ファイル(メモ帳で書きかえて保存するだけ)
// ============================================================
window.URANAI = {
  // サイトの名前(ページ下と、保存画像に入ります)
  siteName: "星詠みルナの占い館",
  // 公開したURL(例: "https://xxxx.netlify.app")。Xでシェアした時にリンクがつきます
  siteUrl: "",
  // Xのアカウント(例: "@luna_uranai")。保存画像に入ります
  xHandle: "",

  // 完全版の販売ページURL(Stripeの支払いリンク・note・BOOTH など)。空なら購入ボタンは出ません
  payUrl: {
    all: "", // 全部の占いで同じページにするならここだけでOK
    // tenchusatsu: "https://buy.stripe.com/xxxx",
  },
  price: { all: "500円" },

  // 完全版をひらく「合言葉」のハッシュ。合言葉メーカー.html で作って貼りかえてください。
  // ⚠️ 見本のまま公開すると誰でも開けてしまうので、かならず変えてね
  unlock: {
    tenchusatsu: "46fa1512ffa8a36ee9f10a06a883943ebf1e421a7cef5377e1466f332cbd95d1", // 見本の合言葉: sample-tenchusatsu
    numerology2027: "c98ee8d3908d369bf80182c52babf09203b822ad55ba3978480e25202e2324bc", // 見本の合言葉: sample-numerology2027
    oshi: "ddacf4b6af4a553b19f6383ddbe33444c5864fc4b123d7567c1c0b77c45d6dfe", // 見本の合言葉: sample-oshi
    saju: "f50ee6385722cc336f2b9a7b8f9cbacb516eff06ad7b83ad8b32ba796f260214", // 見本の合言葉: sample-saju
    tarot: "908637db0fe13e44e67ef7863cc7b929fef5fea140b886aff72a490053b540b7", // 見本の合言葉: sample-tarot
    aura: "28dcac6cdfab6c18bc8dc26a79602ca03b9d77107276a76b045d1d9ec7c8bc1b", // 見本の合言葉: sample-aura
  },
  // 全部の占いをまとめてひらく合言葉(セット販売用)。見本: sample-all
  allPassHash: "dc0cecf12448162484044d3038687e758db294da3ff76c69348dc35dbacbafe3",
};
