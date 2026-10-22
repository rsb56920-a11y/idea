# PixAI用プロンプト集（ギアダイバー）

PixAI にそのままコピペして使えるプロンプト集です。
**キャラ（パイロット5人）とロボ** を中心に、敵と背景も入れてあります。

作った画像は、同じフォルダの **`画像そろえ器.html`** に入れると、背景を消して、サイズと名前をそろえて保存できます。
（PixAI の出力サイズがぴったりでなくても大丈夫です）

---

## 0. 先に決めておくこと（絵柄をそろえるコツ）

1. **モデルを1つに決める**：アニメ調のモデルを1つ選び、全キャラ・全ロボでそれを使い続ける
2. **最初にアカネの normal を何枚か作る** → 気に入った1枚の **シード値（Seed）** をメモ
3. ほかの表情・ほかのキャラも、**同じモデル・同じ設定・同じシード** から始める
4. 表情を変えるときは、プロンプトの最後の【表情】の部分だけを入れ替える
   - 体の形が変わりやすいときは、PixAI の「画像から生成（i2i）」に normal を入れて、表情の部分だけ変えると同じポーズになりやすい

### 全部に共通のネガティブプロンプト（「入れたくないもの」の欄にコピペ）
```
lowres, worst quality, low quality, bad anatomy, bad hands, extra fingers, missing fingers,
extra arms, deformed, blurry, jpeg artifacts, text, watermark, signature, logo, frame, border,
cropped head, out of frame, multiple views, child, loli, shota, nsfw
```

---

## 1. パイロットとノア（`assets/pilots/`）

- **縦長（2:3）** で作る。そろえ器が 1024×1536 に直す
- 背景は **白一色**（あとで消すため）
- ひざ上〜太ももまで、正面、頭の上に少し余白

### 共通の前半（全員この後ろにキャラ部分と表情をつなげる）
```
masterpiece, best quality, anime style, cel shading, clean lineart,
solo, adult, standing, facing viewer, cowboy shot, upper body to thigh,
arms at sides, simple white background, white background,
mecha pilot, sci-fi pilot suit, bodysuit with armor plates,
```

### 表情（最後にどれか1つをつなげる）
| ファイル名の末尾 | コピペする部分 |
|---|---|
| `_normal` | `neutral expression, calm, closed mouth` |
| `_smile` | `big smile, happy, open mouth, bright eyes` |
| `_serious` | `serious face, frowning, determined, sharp eyes` |
| `_sad` | `sad expression, worried, teary eyes, frown` |

### アカネ（`akane_○○.png`）突撃型・赤オレンジ
```
1girl, mature female, 22 years old, short messy red-orange hair, orange eyes,
goggles on head, red and black pilot suit, orange accents, fingerless gloves,
confident, energetic, tomboy,
```
**例：アカネの笑顔をまるごと**
```
masterpiece, best quality, anime style, cel shading, clean lineart,
solo, adult, standing, facing viewer, cowboy shot, upper body to thigh,
arms at sides, simple white background, white background,
mecha pilot, sci-fi pilot suit, bodysuit with armor plates,
1girl, mature female, 22 years old, short messy red-orange hair, orange eyes,
goggles on head, red and black pilot suit, orange accents, fingerless gloves,
confident, energetic, tomboy,
big smile, happy, open mouth, bright eyes
```

### シズク（`shizuku_○○.png`）慎重型・水色
```
1girl, mature female, 24 years old, long light blue hair, high ponytail, calm blue eyes,
white and blue pilot suit, reflective rescue stripes, rescue team patch on shoulder,
gentle, composed,
```

### ルカ（`ruka_○○.png`）強欲型・金
```
1girl, mature female, 21 years old, blonde twintails, golden eyes,
black pilot suit with gold accents, tool belt on waist, coin purse pouch,
cheerful, mischievous,
```

### テツ（`tetsu_○○.png`）鉄壁型・緑
```
1boy, old man, 55 years old, short gray hair with white streaks, short beard,
scar on cheek, green bandana, worn green flight jacket over pilot suit,
muscular, veteran, gruff,
```
※テツは「1girl」を入れない。ネガティブに `female, 1girl` を足すとまちがいが減る

### ノア（`noa_○○.png`）オペレーター・薄紫
```
1girl, mature female, 23 years old, lavender bob cut hair, purple eyes,
round glasses, headset with microphone, operator uniform, hoodie over uniform,
smart, kind,
```
※ノアはパイロットではないので、共通部分の `mecha pilot, sci-fi pilot suit, bodysuit with armor plates,` を消して使う

### 作る枚数
5人 × 4表情 ＝ **20枚**。まず **全員の normal（5枚）** から。normal だけ入れても、ほかの表情は normal で代わりに表示されます。

---

## 2. ロボ（`assets/mech/`）

いちばん難しいところです。AIは「パーツだけ」を同じ角度・同じ大きさでそろえるのが苦手なので、**3段階** で進めます。

### 第1段階：まず「完成したロボ」を1枚作って、デザインを決める
正方形（1:1）、白背景。**背中側（後ろ姿）** が大事。
```
masterpiece, best quality, anime style, cel shading, clean lineart,
chibi mecha, super deformed robot, 2 heads tall, cute chunky robot,
back view, from behind, slightly from above, full body, standing,
white armor, orange accents, round shoulder pads, small head with antenna,
big backpack thrusters, gun on right arm, missile pod on left shoulder,
two short legs, no humans, simple white background, white background, centered
```
ネガティブに足すもの：`front view, face, human, realistic, photo`

→ 気に入った1枚ができたら、それを「お手本」として保存しておく

### 第2段階：胴体だけ（`body.png`）
お手本を PixAI の「画像から生成（i2i）」に入れ、強さ（Strength / Denoise）を 0.5〜0.6 くらいにして：
```
masterpiece, best quality, anime style, cel shading,
chibi mecha torso and head only, back view, from behind,
white armor, orange accents, round shoulder pads, small head with antenna,
backpack, no arms, no legs, no weapons,
simple white background, white background, centered
```
- 胴体だけ画像にすると、**腕・肩・脚はゲームの中で今までの絵が重なって** 表示されます
- これだけでもかなり見た目が変わるので、まずはここまでがおすすめ

### 第3段階：パーツ（1つずつ、全部 正方形・白背景）
お手本と同じモデル・同じシードで、パーツの説明だけ変えて作ります。
共通の前半：
```
masterpiece, best quality, anime style, cel shading, clean lineart,
single mecha part, isolated object, chibi robot part, back view,
white armor, orange accents, no humans, simple white background, white background, centered,
```
後ろにつなげる部分：

| ファイル名 | つなげる部分 |
|---|---|
| `arm_rifle.png` | `robot arm holding a slim pulse rifle, pointing up` |
| `arm_gatling.png` | `robot arm with gatling gun, multiple rotating barrels, pointing up` |
| `arm_shotgun.png` | `robot arm with short double barrel shotgun, pointing up` |
| `arm_cannon.png` | `robot arm with huge bulky buster cannon, pointing up` |
| `arm_drill.png` | `robot arm with large spiral drill, pointing up` |
| `arm_flame.png` | `robot arm with flamethrower nozzle and fuel tank, pointing up` |
| `sho_missile.png` | `shoulder missile pod, box launcher with six missile holes` |
| `sho_laser.png` | `shoulder mounted long laser cannon, pointing up` |
| `sho_bit.png` | `small shoulder dock for floating gun drones` |
| `sho_mortar.png` | `shoulder grenade launcher, short wide barrel, tilted up` |
| `sho_shield.png` | `large shoulder shield plate, pentagon shape` |
| `leg_biped.png` | `two short chunky robot legs, thrusters on heels` |
| `leg_hover.png` | `hover unit instead of legs, glowing blue underside` |
| `leg_tread.png` | `tank treads instead of legs, two caterpillar tracks` |
| `leg_jet.png` | `jet thruster legs, big rocket nozzles` |

**位置について**：AIが作ったパーツは画像の真ん中に描かれますが、`画像そろえ器.html` に入れると
**右腕は右、肩は左上、脚は下** と、ロボの正しい場所に自動で置き直してくれます（点線の枠の中に入ります）。
それでも少しズレて見えるときだけ、`index.html` の `MECH_OFS` の数字で直してください（`x`＝右へ、`y`＝下へ、`s`＝大きさ）。
パーツが大変なら、**胴体だけ** でも十分ゲームらしくなります。

---

## 3. 敵とボス（`assets/enemies/`）

正方形（1:1）、白背景、**こちら向き（正面）**。
共通の前半：
```
masterpiece, best quality, anime style, cel shading, mecha, enemy robot,
front view, facing viewer, no humans, simple white background, white background, centered,
```
| ファイル名 | つなげる部分 |
|---|---|
| `drone.png` | `small flying drone, round saucer body, single red eye, dark gray metal` |
| `diver.png` | `small triangle shaped attack drone, sharp nose, purple and black, orange engine glow` |
| `turret.png` | `floating gun turret, box shape, three gun barrels, yellow sensor light` |
| `elite.png` | `large spider robot, four mechanical legs, purple armor, pink glowing core` |
| `boss_garm.png` | `giant drilling mothership, hexagon shape, orange armor, huge drills, glowing core` |
| `boss_crystal.png` | `crystal beast, sphere made of teal crystals, crystal spikes, glowing cyan core` |
| `boss_volca.png` | `twin headed fortress turret, molten iron dripping, red hot armor, two big cannons` |
| `boss_nemesis.png` | `ancient machine king, purple and black armor, golden crown, glowing violet core, ominous` |

---

## 4. 背景（`assets/bg/`）

横長（16:9）。**背景は消さない**。地面は描かない（下半分は暗めに）。
共通の前半：
```
masterpiece, best quality, anime style, scenery, no humans, wide shot,
looking straight ahead, horizon at the bottom, dark lower edge,
```
| ファイル名 | つなげる部分 |
|---|---|
| `layer1.png` | `sunset sky, edge of a giant pit in the distance, cliff silhouettes, orange and purple clouds` |
| `layer2.png` | `inside a huge cave, glowing teal crystals on ceiling and walls, mysterious` |
| `layer3.png` | `underground lava cavern, molten iron rivers far away, red glow, heat haze` |
| `layer4.png` | `deep abyss, purple darkness, silhouettes of giant ancient machines, faint violet lights` |

---

## 5. できた画像の入れ方

1. PixAI で作った画像を保存する
2. `画像そろえ器.html` をダブルクリックで開く
3. 「どの画像にする？」から名前を選ぶ → 画像をドラッグ（またはボタンで選ぶ）
4. 背景が消えているか確認して「保存」
5. ダウンロードフォルダにできたファイルを、画面に出ているフォルダ（例：`assets/pilots/`）へ移す
6. `index.html` を開き直すと、ゲームに出る
