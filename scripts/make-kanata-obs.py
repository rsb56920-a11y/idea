"""夜華カナタ_配信セット 用の OBS シーンコレクション JSON を作る。"""
import json, pathlib

BASE = "F:/夜華カナタ_配信セット/"
OUT = pathlib.Path(__file__).resolve().parent.parent / "夜華カナタ_配信セット" / "OBS読みこみ用_夜華カナタ配信セット.json"


def src(id_, name, settings, **kw):
    d = {"id": id_, "versioned_id": id_, "name": name, "settings": settings, "mixers": kw.get("mixers", 0),
         "enabled": True, "flags": 0, "volume": 1.0, "muted": False, "sync": 0, "hotkeys": {},
         "monitoring_type": kw.get("monitoring", 0), "private_settings": {}}
    return d


def browser(name, file, w, h, fps=30, audio=False):
    return src("browser_source", name, {
        "is_local_file": True, "local_file": BASE + file, "width": w, "height": h, "fps": fps,
        "fps_custom": True, "shutdown": True, "restart_when_active": False, "reroute_audio": audio,
        "css": "body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }",
    }, mixers=255 if audio else 0)


def item(name, i, x=0, y=0, s=1.0):
    return {"name": name, "id": i, "visible": True, "locked": False, "rot": 0.0, "pos": {"x": x, "y": y},
            "scale": {"x": s, "y": s}, "align": 5, "bounds_type": 0, "bounds_align": 0, "bounds": {"x": 0.0, "y": 0.0},
            "crop_left": 0, "crop_top": 0, "crop_right": 0, "crop_bottom": 0, "group_item_backup": False,
            "scale_filter": "disable", "blend_method": "default", "blend_type": "normal",
            "show_transition": {"duration": 0}, "hide_transition": {"duration": 0}, "private_settings": {}}


def scene(name, items):
    return src("scene", name, {"items": [item(n, k + 1, *p) for k, (n, *p) in enumerate(items)],
                               "id_counter": len(items), "custom_size": False})


sources = [
    browser("画面_まもなく", "soon.html", 1920, 1080),
    browser("画面_休憩", "break.html", 1920, 1080),
    browser("画面_おわり", "end.html", 1920, 1080),
    browser("通知とコメント", "alerts.html", 1920, 1080, audio=True),
    browser("ちびカナタ_PNGTuber", "pngtuber.html", 500, 900),
    browser("マップ隠し_ちびカナタ", "mapcover.html", 300, 360, fps=20),
    browser("名前プレート", "game-overlay.html", 520, 90, fps=10),
    src("game_capture", "LoLの画面", {"capture_mode": "window",
        "window": "League of Legends (TM) Client:RiotWindowClass:League of Legends.exe",
        "priority": 2, "capture_cursor": True, "allow_transparency": False}),
    src("wasapi_input_capture", "マイク", {"device_id": "default"}, mixers=255),
    src("wasapi_output_capture", "デスクトップ音声", {"device_id": "default"}, mixers=255),
    scene("① まもなく", [("画面_まもなく",), ("通知とコメント",)]),
    scene("② ゲーム", [("LoLの画面",), ("名前プレート", 16, 12, 0.8), ("ちびカナタ_PNGTuber", 0, 330, 0.36),
                        ("マップ隠し_ちびカナタ", 1620, 720), ("通知とコメント",)]),
    scene("③ 休憩", [("画面_休憩",), ("通知とコメント",)]),
    scene("④ おわり", [("画面_おわり",), ("通知とコメント",)]),
]
# マイクとデスクトップ音声は全シーンに入れる(シーンに入っていない音声は配信にのらない)
for s in sources:
    if s["name"] in ("① まもなく", "② ゲーム", "③ 休憩", "④ おわり"):
        its = s["settings"]["items"]
        for n in ("マイク", "デスクトップ音声"):
            its.append(item(n, len(its) + 1))
        s["settings"]["id_counter"] = len(its)

data = {
    "current_scene": "① まもなく", "current_program_scene": "① まもなく",
    "scene_order": [{"name": n} for n in ("① まもなく", "② ゲーム", "③ 休憩", "④ おわり")],
    "name": "夜華カナタ配信セット", "sources": sources, "groups": [], "quick_transitions": [],
    "transitions": [], "saved_projectors": [], "current_transition": "フェード", "transition_duration": 400,
    "preview_locked": False, "scaling_enabled": False, "scaling_level": 0, "scaling_off_x": 0.0,
    "scaling_off_y": 0.0, "modules": {},
}
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print("wrote", OUT)
