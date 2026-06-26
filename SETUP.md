# Setup — Web-app screen capture with Cowork + Playwright MCP

คู่มือสำหรับคนอื่นที่อยากใช้ pattern นี้ทำ "prompt ครั้งเดียว → Claude ขับ flow ในเว็บ → ได้รูป + deck"
กับ self-hosted / LAN / behind-VPN service (Synology, Proxmox, Home Assistant, Grafana, Jenkins,
internal admin pages ฯลฯ) — สิ่งที่ Cowork cloud sandbox **เข้าไม่ถึง**

> **ทำไมต้องเซ็ตอะไรพิเศษ:** Cowork sandbox = cloud VM, มี outbound allowlist เข้มงวด เข้า
> `*.local` / RFC1918 IP / VPN-only service ไม่ได้. Browser MCP (Claude-in-Chrome) เห็น DOM
> ของ Chrome คุณก็จริง แต่ `save_to_disk` ปัจจุบัน no-op → ไม่มีทาง dump pixel ลง disk จาก
> session โดยตรง. ทางแก้คือ **Playwright MCP ที่รันบน Mac ของคุณเอง**

---

## Prerequisites

- **macOS 14+** (Apple Silicon ที่ทดสอบ) **หรือ Windows 10/11** หรือ **Linux** (Ubuntu 22.04+)
  - MCPB format รองรับทั้ง 3 platform โดย Anthropic, manifest ของ playwright-mcp มี `platforms: ["darwin","linux","win32"]` แล้ว
- **Node.js ≥ 18** (`node --version`) — `@playwright/mcp` ต้องการ
- **Python ≥ 3.9** + **Pillow** (`pip install Pillow`) — สำหรับ `annotate.py`
- **Cowork** desktop app + login
- **Disk free ≥ 500 MB** (Chromium binary ~170 MB + bundle ~4 MB + screenshots)

ไม่ต้องเซ็ต SSH/VPN/Tailscale เพิ่ม — Playwright รัน local ใช้ network stack ของเครื่องอยู่แล้ว

### Windows ก่อนเริ่ม — execution policy (ทำก่อนอย่างอื่น)

PowerShell บน Windows บล็อก script ของ npm/npx เป็นค่า default (`npx.ps1 cannot be loaded
because running scripts is disabled`). ต้องปลดล็อกก่อน ไม่งั้น `npm` / `npx` ใช้ไม่ได้เลย:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

`RemoteSigned` = รัน script ที่สร้าง local ได้ แต่ script ที่โหลดมาต้อง sign — ปลอดภัยและ
ไม่ต้องสิทธิ์ admin. **เปิด PowerShell หน้าต่างใหม่** หลังตั้งค่า (policy อ่านตอน start session).
ถ้าต้องรันทันทีในหน้าต่างเดิม ใช้ `npx.cmd` แทน `npx` (เลี่ยง `.ps1`).

ทางลัด: `scripts\windows-bootstrap.ps1` ตั้ง policy ให้ + เช็ค Node + โหลด browser ให้ครบในคำสั่งเดียว:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows-bootstrap.ps1
```

### Per-platform paths

| What | macOS | Windows | Linux |
|---|---|---|---|
| Chromium cache | `~/Library/Caches/ms-playwright/` | `%LOCALAPPDATA%\ms-playwright\` | `~/.cache/ms-playwright/` |
| MCPB install | Settings → Extensions, drag .mcpb | Settings → Extensions, drag .mcpb | (Claude Desktop ยังไม่มี Linux build — ใช้ web หรือรันเอง) |
| Open .mcpb เพื่อ install | `open playwright-mcp.mcpb` | `start playwright-mcp.mcpb` (cmd) / `Invoke-Item playwright-mcp.mcpb` (PowerShell) | `xdg-open playwright-mcp.mcpb` |
| Env var ใน shell | `NAS_USER=x npm run capture` | cmd: `set NAS_USER=x && npm run capture`<br>PowerShell: `$env:NAS_USER='x'; npm run capture` | `NAS_USER=x npm run capture` |
| Cron-equivalent | `crontab -e` | Task Scheduler (`taskschd.msc`) | `crontab -e` |

---

## Step 1 — Install Playwright MCP

มี 3 ทาง — **บน Windows แนะนำทาง A** (hardened bundle ใน repo นี้)

### ทาง A: Build hardened bundle จาก repo (แนะนำ โดยเฉพาะ Windows)

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\build-mcpb.ps1
# ได้ dist\playwright-mcp.mcpb → ลากเข้า Cowork Settings → Extensions → full restart
```

```bash
# macOS / Linux
cd mcpb && npm install --omit=dev && zip -r ../dist/playwright-mcp.mcpb . -x '*.log' '*.bak*'
```

**ทำไมต้องใช้ตัวนี้แทน `npx @playwright/mcp@latest`:** Claude Desktop / Cowork โหลด bundle ด้วย
built-in (Electron-as-Node) runtime ของตัวเอง. launcher ที่ shell ออกไปเรียก `npx … @latest`
จะ **ตายประมาณ 5–7 วิหลัง `initialize`** (log ขึ้น `Server transport closed unexpectedly`)
เพราะ (1) PATH ต่างจาก shell ปกติ + `@latest` ต้อง resolve ผ่าน network ทุกครั้ง และ
(2) `stdio:'inherit'` ไม่ forward stdin pipe ลง grandchild ภายใต้ Electron → server เห็น EOF
แล้ว exit. bundle ใน `mcpb/` แก้ทั้งสองจุด: vendor `@playwright/mcp` แบบ **pin version**
(ไม่มี npx/network) แล้ว bridge stdin/stdout เองด้วย Node stream. ดู [`mcpb/README.md`](mcpb/README.md)

### ทาง B: Pre-built `.mcpb` (เร็ว)

1. Download `playwright-mcp.mcpb` ที่ผมส่งให้ใน chat (3.7 MB)
2. ดับเบิ้ลคลิกไฟล์
   - **macOS / Windows**: Claude Desktop / Cowork ขึ้น pop-up "Install extension?" — กด Install
   - หรือ drag ไฟล์เข้า Cowork Settings → Extensions
3. Extension register ที่
   - macOS: `~/Library/Application Support/Claude/Extensions/`
   - Windows: `%APPDATA%\Claude\Extensions\`
4. **Full quit Cowork แล้วเปิดใหม่**
   - macOS: Cmd+Q
   - Windows: Right-click tray icon → Quit (หรือ Task Manager → End Task)

### ทาง C: Build จาก scratch (manual)

```bash
mkdir -p /tmp/playwright-mcp && cd /tmp/playwright-mcp
npm init -y > /dev/null
npm install --omit=dev @playwright/mcp

cat > manifest.json <<'EOF'
{
  "manifest_version": "0.3",
  "name": "playwright-mcp",
  "display_name": "Playwright MCP",
  "version": "0.1.0",
  "description": "Browser automation via Microsoft @playwright/mcp",
  "author": { "name": "you" },
  "license": "Apache-2.0",
  "server": {
    "type": "node",
    "entry_point": "node_modules/@playwright/mcp/cli.js",
    "mcp_config": {
      "command": "node",
      "args": [
        "${__dirname}/node_modules/@playwright/mcp/cli.js",
        "--browser=chromium",
        "--isolated",
        "--ignore-https-errors",
        "--viewport-size=1440,900"
      ]
    }
  },
  "tools_generated": true,
  "compatibility": { "runtimes": { "node": ">=18.0.0" } }
}
EOF

zip -r playwright-mcp.mcpb . -x "*.DS_Store"
open playwright-mcp.mcpb   # macOS — Cowork picks it up
```

---

## Step 2 — First-run browser install

หลังจาก Cowork restart, เปิด session ใหม่ → prompt Claude:

```
@Playwright_MCP browser_install
```

Playwright โหลด `chrome-for-testing` ราว 170 MB ลง `~/Library/Caches/ms-playwright/`.
ครั้งเดียวจบ, ครั้งถัดไป re-use ทันที

ทดสอบ:

```
@Playwright_MCP browser_navigate https://example.com
@Playwright_MCP browser_take_screenshot
```

ควรเห็น screenshot inline + path ที่ save

---

## Step 3 — Project structure

ในโฟลเดอร์ project ของคุณ (อันที่ mount เข้า Cowork) ใส่ไฟล์เหล่านี้:

```
your-project/
├── COWORK_INSTRUCTIONS.md   ← copy จากไฟล์เพื่อนบ้านในโปรเจ็คนี้
├── shots/                    ← Playwright save shots ที่นี่
│   └── .gitkeep
├── capture.spec.ts           ← optional fallback (เผื่อจะรัน headless cron)
├── playwright.config.ts      ← optional
└── package.json              ← optional
```

ที่สำคัญที่สุดคือ `COWORK_INSTRUCTIONS.md` ใส่เนื้อหาให้ Claude อ่านเป็น project instruction

ตั้ง Cowork ให้รู้จัก project นี้:
1. Cowork → Settings → Projects → Add
2. Path: เลือก folder ของคุณ
3. **Instructions** field: paste เนื้อหาทั้งหมดของ `COWORK_INSTRUCTIONS.md`

---

## Step 4 — Prompt pattern

หลังจาก setup เสร็จ ใช้ pattern นี้กับ use-case ใดก็ได้:

```
"capture flow X จาก <URL> เก็บลง deck"
```

ตัวอย่างจริง:

> Capture homepage + dashboard ของ Grafana ที่ http://grafana.lan:3000
> เก็บ panels เด่นๆ ใส่ slide สรุปสำหรับ standup

> ไปที่ https://homeassistant.local:8123 login user=admin pass=$HA_PASS  
> เปิด Energy dashboard, capture กราฟวันนี้ ใส่ pptx caption ภาษาไทย

> เปิด Proxmox web UI ที่ https://192.168.1.10:8006, capture VM list + storage status,
> ทำ status report .docx สั้นๆ

Claude จะใช้ Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_take_screenshot`) ตามที่ `COWORK_INSTRUCTIONS.md` บอกไว้

---

## Configuration knobs

### Persistent session (ไม่ต้อง login ทุกครั้ง)

แก้ MCPB manifest `args`:

```jsonc
"args": [
  "-y", "@playwright/mcp@latest",
  "--browser=chromium",
  "--user-data-dir=${HOME}/.cache/playwright-mcp-profile",  // macOS/Linux
  // Windows: ใช้ ${LOCALAPPDATA}\\playwright-mcp-profile แทน
  "--ignore-https-errors",
  "--viewport-size=1440,900"
]
```

ครั้งแรก login ผ่าน Playwright หนึ่งครั้ง → cookie/session เก็บใน profile dir → ครั้งถัดไป
ไปตรง dashboard เลย ไม่ต้องเอา password มาใส่

> ถ้าใช้ hardened bundle (Step 1 ทาง A) ไม่ต้องแก้ manifest — set env `PLAYWRIGHT_MCP_ARGS`
> เป็น flags ที่ต้องการได้เลย (เช่น `--browser=chromium --user-data-dir=... --ignore-https-errors`),
> หรือแก้ `flags` ใน `mcpb/server.js` แล้ว rebuild

**Cross-platform variable substitution** (MCPB spec รองรับ): `${HOME}`, `${DESKTOP}`, `${DOCUMENTS}`, `${DOWNLOADS}` ทำงานทั้ง macOS/Windows/Linux. ถ้าจะใช้ Windows-only เปลี่ยนเป็น `${LOCALAPPDATA}` ใน manifest

### Headed mode (เห็น browser ขับเองตอน debug)

```jsonc
"args": ["-y", "@playwright/mcp@latest", "--no-headless", ...]
```

### Per-use-case PII blur

ดูใน `COWORK_INSTRUCTIONS.md` — มี opt-in policy ไม่ blanket blur

---

## Troubleshooting

### `Browser "chrome-for-testing" is not installed`

รัน `@Playwright_MCP browser_install` ใน Cowork session ใดก็ได้, หรือบน CLI:
```bash
npx @playwright/mcp install-browser chrome-for-testing
```

### Windows: `npx.ps1 cannot be loaded because running scripts is disabled`

PowerShell execution policy บล็อก. ตั้ง `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
แล้วเปิดหน้าต่างใหม่ (ดู "Windows ก่อนเริ่ม" ด้านบน). เฉพาะหน้าต่างเดิม ใช้ `npx.cmd` แทน `npx`

### MCP crash-loop: `Server transport closed unexpectedly` หลัง `initialize`

อาการ: ใน `%APPDATA%\Claude\logs\mcp-server-Playwright MCP.log` server `started and connected`
แล้วตายภายในไม่กี่วิหลัง `initialize`, วนซ้ำทุก restart. สาเหตุคือ launcher ที่เรียก
`npx @playwright/mcp@latest` ผ่าน shell หรือใช้ `stdio:'inherit'` ภายใต้ built-in node ของ Claude.
**วิธีแก้: ใช้ hardened bundle (Step 1 ทาง A).** หมายเหตุ debug: Claude Desktop ไม่ส่ง stderr ของ
MCP server ลง log ไฟล์ — ถ้าจะ debug เอง ให้ `server.js` เขียน log ลงไฟล์โดยตรง

### Cowork ไม่เห็น Playwright tools หลัง install

- Full quit Cowork (Cmd+Q), เปิดใหม่
- เปิด session ใหม่ (ของเก่าไม่ pick up MCP ที่เพิ่งติดตั้ง)
- Check ใน Settings → Extensions ว่า `playwright-mcp` enabled

### `Plugins may only declare remote (http/sse/ws) or MCPB servers`

แสดงว่าใส่เป็น `.plugin` (Cowork plugin format) ที่ใช้ stdio MCP — Cowork ห้าม. ต้อง
package เป็น `.mcpb` (Anthropic MCPB format) เท่านั้น ดู Step 1 ทาง B

### Screenshot ไม่ตรงโฟลเดอร์ที่อยาก

Playwright MCP รับ **absolute path** ที่ `--filename` ได้ ใช้ full path เสมอ:
`/Users/you/Projects/myproject/shots/foo.png`

### Self-signed cert error

MCPB manifest ตัวที่ผมให้มี `--ignore-https-errors` แล้ว ถ้าสร้างเอง ใส่ flag นี้ใน args

### `--browser=chromium` ช้า เพราะดาวน์โหลด chromium ใหม่

เปลี่ยนเป็น `--browser=chrome` ใช้ Google Chrome ที่ติดตั้งบนเครื่องอยู่แล้ว
(macOS/Windows/Linux มี Chrome เหมือนกัน, Playwright resolve ได้เอง). แต่ session จะปนกับ Chrome ปกติ — ถ้าไม่อยาก ใช้ `--isolated` ร่วมกับ chrome

### Windows: env var ไม่ผ่าน `npm run capture`

แก้ด้วยใช้ `cross-env` ที่ผมใส่ใน `package.json` แล้ว:
```
npm install        # ลง cross-env ด้วย
npm run capture    # cross-env จัดการให้ NAS_USER, NAS_PASS ทำงานทั้ง 3 platforms
```

หรือ inline:
```cmd
:: Windows cmd
set NAS_USER=admin && set NAS_PASS=xxx && npx playwright test capture.spec.ts

:: Windows PowerShell
$env:NAS_USER='admin'; $env:NAS_PASS='xxx'; npx playwright test capture.spec.ts
```

### Windows: cron-equivalent

ใช้ Task Scheduler. สร้าง basic task → trigger daily 08:00 → action = "Start a program":
- Program: `C:\Program Files\nodejs\npx.cmd`
- Arguments: `playwright test capture.spec.ts`
- Start in: `C:\Users\<you>\Projects\Capture screen playwright demo`
- Environment vars ใน task definition (Advanced → Environment) หรือใส่ command line ผ่าน cmd wrapper

หรือใช้ `schtasks` CLI ตรงๆ ดูเอกสาร Microsoft docs

### Windows: Python `annotate.py` ไม่หา font เจอ

`annotate.py` มี Windows font fallback แล้ว (Segoe UI Bold, Arial Bold ที่ `C:\Windows\Fonts\`). ถ้าใช้ font อื่น แก้ list ใน `load_font()`. ถ้า Pillow error ตอน open font → `pip install Pillow --upgrade`

---

## Adapting to your own use-case

Pattern เดียวกัน เปลี่ยนแค่ URL + selector strategy:

| Use-case | URL | Selector hint |
|---|---|---|
| Synology DSM | `https://<id>.quickconnect.to` | role-based (treeitem, menuitem) |
| Proxmox | `https://<ip>:8006` | XPath through ExtJS tree |
| Home Assistant | `https://homeassistant.local:8123` | data-domain attributes |
| Grafana | `http://grafana.lan:3000` | aria-label on panels |
| Jenkins | `http://jenkins.lan:8080` | role=link with name |
| internal docs | `http://docs.lan` | semantic HTML |

Tip: prompt ตัวแรก ให้ Claude `browser_snapshot` หน้าเป้าหมายก่อน เขาจะหา stable selector
ให้เอง (`getByRole`, `getByText`) — อย่าให้เดา CSS class ที่ framework สร้างมา

---

## What this gives you

- **Local-first**: screenshots ไม่ผ่าน cloud, อยู่ใน mounted folder
- **Privacy-preserving**: ถ้าไม่ Read shots, Claude ไม่เห็น pixel — bytes ไหลตรง Chromium → disk → .pptx (private data ของคุณไม่เข้า API)
- **Reusable**: pattern นี้ใช้กับ web app ใดก็ได้ ไม่ผูกกับ Synology
- **Cron-portable**: capture.spec.ts ที่ผม emit ออกมาด้วย → ใช้ลอย headless บน cron ได้
  ไม่ต้องมี Claude อยู่ในลูป

ถามต่อ/ทำเพิ่มเติม: ดู `COWORK_INSTRUCTIONS.md` ที่อยู่คู่ในโฟลเดอร์เดียวกัน
