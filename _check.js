
/* ===== 工具函数 ===== */
const $=id=>document.getElementById(id);
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000)}
function copyText(text){navigator.clipboard.writeText(text).then(()=>toast('已复制')).catch(()=>toast('复制失败'))}
function fmtSize(b){if(b===0)return'0 B';const k=1024,s=['B','KB','MB','GB'];const i=Math.floor(Math.log(b)/Math.log(k));return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+s[i]}
function fmtTime(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
/* ===== API 配置与请求 ===== */
const API_CFG_KEY='kayhs_api_cfg';
function getApiCfg(){try{return JSON.parse(localStorage.getItem(API_CFG_KEY)||'{}')}catch(e){return{}}}
function saveApiCfg(cfg){localStorage.setItem(API_CFG_KEY,JSON.stringify(cfg))}
function apiBase(){const c=getApiCfg();return c.baseUrl||''}
function apiKey(){const c=getApiCfg();return c.apiKey||''}
async function apiRequest(path,opts={}){
  const base=apiBase();
  if(!base){toast('请先配置API地址');location.hash='settings';return null}
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  if(apiKey())headers['X-API-Key']=apiKey();
  try{
    const res=await fetch(base+path,{...opts,headers});
    if(res.status===401){toast('API密钥错误');return null}
    if(!res.ok){const err=await res.text();throw new Error(err||'请求失败')}
    if(opts.raw)return res;
    return await res.json();
  }catch(e){toast('网络错误: '+e.message);return null}
}
async function apiUpload(path,file,onProgress){
  const base=apiBase();
  if(!base){toast('请先配置API地址');location.hash='settings';return null}
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST',base+path);
    if(apiKey())xhr.setRequestHeader('X-API-Key',apiKey());
    xhr.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(Math.round(e.loaded/e.total*100))};
    xhr.onload=()=>{try{resolve(JSON.parse(xhr.responseText))}catch(e){reject(e)}};
    xhr.onerror=()=>{toast('上传失败');reject(new Error('upload failed'))};
    const fd=new FormData();fd.append('file',file);xhr.send(fd);
  });
}
/* ===== 路由 ===== */
const routes=['home','drive','tools','tool','nav','short','snippets','blog','guestbook','settings'];
function router(){
  const hash=location.hash.slice(1)||'home';
  const [route,param]=hash.split('/');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-links a[data-route]').forEach(a=>a.classList.toggle('active',a.dataset.route===route));
  document.getElementById('navLinks').classList.remove('mobile-open');
  if(route==='tool'&&param){showTool(param);$('view-tool').classList.add('active')}
  else if(routes.includes(route)){$('view-'+route).classList.add('active')}
  else{$('view-home').classList.add('active')}
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',()=>router());
/* ===== 搜索 ===== */
function openSearch(){$('searchOverlay').classList.add('active');$('searchInput').value='';$('searchInput').focus();renderSearch('')}
function closeSearch(){$('searchOverlay').classList.remove('active')}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openSearch()}if(e.key==='Escape')closeSearch()});
$('searchInput').addEventListener('input',e=>renderSearch(e.target.value));
function renderSearch(q){
  q=q.toLowerCase();
  const pages=[{type:'页面',name:'首页',route:'home'},{type:'页面',name:'个人云盘',route:'drive'},{type:'页面',name:'在线工具箱',route:'tools'},{type:'页面',name:'网址导航',route:'nav'},{type:'页面',name:'短链接',route:'short'},{type:'页面',name:'代码片段',route:'snippets'},{type:'页面',name:'博客',route:'blog'},{type:'页面',name:'留言板',route:'guestbook'},{type:'页面',name:'设置',route:'settings'}];
  const items=[...pages,...TOOLS.map(t=>({type:'工具',name:t.name,route:'tool/'+t.id}))];
  const filtered=q?items.filter(i=>i.name.toLowerCase().includes(q)):items;
  $('searchResults').innerHTML=filtered.slice(0,15).map((i,idx)=>`<div class="search-result ${idx===0?'selected':''}" onclick="location.hash='${i.route}';closeSearch()"><span class="search-result-type">${i.type}</span><span class="search-result-name">${i.name}</span></div>`).join('')||'<div class="search-result"><span class="search-result-name" style="color:var(--muted)">无结果</span></div>';
}
/* ===== 28个工具定义 ===== */
const TOOLS=[
{id:'json',name:'JSON格式化',cat:'编码开发',desc:'格式化、压缩、校验JSON'},{id:'base64',name:'Base64编解码',cat:'编码开发',desc:'文本与Base64互转'},
{id:'url',name:'URL编解码',cat:'编码开发',desc:'URL encode/decode'},{id:'timestamp',name:'时间戳转换',cat:'编码开发',desc:'时间戳与日期互转'},
{id:'uuid',name:'UUID生成器',cat:'编码开发',desc:'批量生成UUID v4'},{id:'hash',name:'Hash计算',cat:'编码开发',desc:'MD5/SHA1/SHA256/SHA512'},
{id:'jwt',name:'JWT解码',cat:'编码开发',desc:'解析JWT token'},{id:'regex',name:'正则测试',cat:'编码开发',desc:'正则匹配与替换'},
{id:'diff',name:'文本Diff对比',cat:'编码开发',desc:'两段文本逐行对比'},{id:'convert',name:'进制转换',cat:'编码开发',desc:'二/八/十/十六进制互转'},
{id:'sql',name:'SQL格式化',cat:'编码开发',desc:'美化SQL语句'},{id:'markdown',name:'Markdown编辑器',cat:'编码开发',desc:'实时预览Markdown'},
{id:'cron',name:'Cron解析',cat:'编码开发',desc:'解析cron表达式'},{id:'qrcode',name:'二维码生成',cat:'图片处理',desc:'输入文本生成二维码'},
{id:'qrdecode',name:'二维码解析',cat:'图片处理',desc:'上传二维码识别内容'},{id:'imgcompress',name:'图片压缩',cat:'图片处理',desc:'压缩图片体积'},
{id:'imgconvert',name:'图片格式转换',cat:'图片处理',desc:'PNG/JPG/WebP互转'},{id:'imgbase64',name:'图片转Base64',cat:'图片处理',desc:'图片转Data URL'},
{id:'imgcolor',name:'图片取色器',cat:'图片处理',desc:'从图片取色'},{id:'imgresize',name:'图片尺寸调整',cat:'图片处理',desc:'修改图片宽高'},
{id:'color',name:'颜色转换器',cat:'设计工具',desc:'HEX/RGB/HSL互转'},{id:'gradient',name:'CSS渐变生成',cat:'设计工具',desc:'生成渐变CSS'},
{id:'palette',name:'配色方案生成',cat:'设计工具',desc:'输入主色生成配色'},{id:'password',name:'密码生成器',cat:'实用工具',desc:'生成随机密码'},
{id:'random',name:'随机数生成器',cat:'实用工具',desc:'指定区间生成随机数'},{id:'wordcount',name:'字数统计',cat:'实用工具',desc:'统计字符/单词/行数'},
{id:'pomodoro',name:'番茄钟',cat:'实用工具',desc:'25+5专注计时'},{id:'timer',name:'倒计时/秒表',cat:'实用工具',desc:'通用计时器'}
];
const CATS=['全部','编码开发','图片处理','设计工具','实用工具'];
let currentCat='全部';
function renderToolCats(){$('toolCats').innerHTML=CATS.map(c=>`<div class="tool-cat ${c===currentCat?'active':''}" onclick="currentCat='${c}';renderToolCats();renderToolGrid()">${c}</div>`).join('')}
function renderToolGrid(){
  const list=currentCat==='全部'?TOOLS:TOOLS.filter(t=>t.cat===currentCat);
  $('toolGrid').innerHTML=list.map(t=>`<div class="tool-card" onclick="location.hash='tool/${t.id}'"><div class="tool-card-name">${t.name}</div><div class="tool-card-desc">${t.desc}</div></div>`).join('');
}
renderToolCats();renderToolGrid();
/* ===== 工具详情渲染 ===== */
function showTool(id){
  const t=TOOLS.find(x=>x.id===id);if(!t)return;
  $('toolDetailTitle').textContent=t.name;
  $('toolPanel').innerHTML=TOOL_RENDER[id]?TOOL_RENDER[id]():'<p style="color:var(--muted)">工具加载中...</p>';
}
const TOOL_RENDER={
json:()=>`<div class="tool-row"><label>输入JSON</label><textarea id="jsonInput" placeholder='{"key":"value"}'></textarea></div><div class="btn-row"><button class="btn btn-sm" onclick="jsonFormat('format')">格式化</button><button class="btn btn-sm btn-outline" onclick="jsonFormat('compress')">压缩</button><button class="btn btn-sm btn-outline" onclick="jsonFormat('validate')">校验</button></div><div class="tool-row" style="margin-top:20px"><label>结果</label><div class="result" id="jsonResult"></div></div>`,
base64:()=>`<div class="tool-row"><label>文本</label><textarea id="b64Text" placeholder="输入文本..."></textarea></div><div class="btn-row"><button class="btn btn-sm" onclick="b64Encode()">编码 →</button><button class="btn btn-sm btn-outline" onclick="b64Decode()">← 解码</button></div><div class="tool-row" style="margin-top:20px"><label>Base64</label><textarea id="b64Result" placeholder="Base64结果..."></textarea></div>`,
url:()=>`<div class="tool-row"><label>文本</label><textarea id="urlText" placeholder="输入文本或URL..."></textarea></div><div class="btn-row"><button class="btn btn-sm" onclick="urlEncode()">编码 →</button><button class="btn btn-sm btn-outline" onclick="urlDecode()">← 解码</button></div><div class="tool-row" style="margin-top:20px"><label>结果</label><div class="result" id="urlResult"></div></div>`,
timestamp:()=>`<div class="tool-row"><label>当前时间戳</label><div class="result" id="tsNow" style="cursor:pointer" onclick="copyText(this.textContent)">${Math.floor(Date.now()/1000)}</div></div><div class="tool-row"><label>时间戳转日期（秒）</label><input type="text" id="tsInput" placeholder="1700000000" oninput="tsToDate()"><div class="result" id="tsDateResult" style="margin-top:8px"></div></div><div class="tool-row"><label>日期转时间戳</label><input type="text" id="dateInput" placeholder="2026-01-01 00:00:00" oninput="dateToTs()"><div class="result" id="dateTsResult" style="margin-top:8px"></div></div>`,
uuid:()=>`<div class="tool-row"><label>生成数量</label><input type="number" id="uuidCount" value="5" min="1" max="100"></div><button class="btn btn-sm" onclick="genUUID()">生成UUID</button><div class="tool-row" style="margin-top:20px"><label>结果（点击复制）</label><div class="result" id="uuidResult"></div></div>`,
hash:()=>`<div class="tool-row"><label>输入文本</label><textarea id="hashInput" placeholder="输入文本..." oninput="calcHash()"></textarea></div><div class="tool-row"><label>MD5</label><div class="result" id="hashMd5"></div></div><div class="tool-row"><label>SHA-1</label><div class="result" id="hashSha1"></div></div><div class="tool-row"><label>SHA-256</label><div class="result" id="hashSha256"></div></div><div class="tool-row"><label>SHA-512</label><div class="result" id="hashSha512"></div></div>`,
jwt:()=>`<div class="tool-row"><label>粘贴JWT Token</label><textarea id="jwtInput" placeholder="eyJhbGciOiJIUzI1NiIs..." oninput="decodeJWT()"></textarea></div><div class="tool-row"><label>Header</label><pre class="result" id="jwtHeader"></pre></div><div class="tool-row"><label>Payload</label><pre class="result" id="jwtPayload"></pre></div>`,
regex:()=>`<div class="tool-row"><label>正则表达式</label><input type="text" id="rePattern" placeholder="\d+" oninput="testRegex()"></div><div class="tool-row"><label>标志（g/i/m）</label><input type="text" id="reFlags" value="g" oninput="testRegex()"></div><div class="tool-row"><label>测试文本</label><textarea id="reText" placeholder="输入测试文本..." oninput="testRegex()"></textarea></div><div class="tool-row"><label>匹配结果</label><div class="result" id="reResult"></div></div>`,
diff:()=>`<div class="tool-row"><label>文本A</label><textarea id="diffA" placeholder="第一段文本..."></textarea></div><div class="tool-row"><label>文本B</label><textarea id="diffB" placeholder="第二段文本..."></textarea></div><button class="btn btn-sm" onclick="doDiff()">对比</button><div class="tool-row" style="margin-top:20px"><label>差异（绿色=新增，红色=删除）</label><div class="result" id="diffResult"></div></div>`,
convert:()=>`<div class="tool-row"><label>十进制</label><input type="text" id="decInput" placeholder="输入十进制数" oninput="fromDec()"></div><div class="tool-row"><label>二进制</label><input type="text" id="binInput" placeholder="输入二进制数" oninput="fromBin()"></div><div class="tool-row"><label>八进制</label><input type="text" id="octInput" placeholder="输入八进制数" oninput="fromOct()"></div><div class="tool-row"><label>十六进制</label><input type="text" id="hexInput" placeholder="输入十六进制数" oninput="fromHex()"></div>`,
sql:()=>`<div class="tool-row"><label>输入SQL</label><textarea id="sqlInput" placeholder="SELECT * FROM users WHERE id=1"></textarea></div><button class="btn btn-sm" onclick="formatSQL()">格式化</button><div class="tool-row" style="margin-top:20px"><label>结果</label><pre class="result" id="sqlResult"></pre></div>`,
markdown:()=>`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div><label style="display:block;font-size:13px;color:var(--muted);margin-bottom:8px">Markdown</label><textarea id="mdInput" style="width:100%;min-height:300px;font-family:'JetBrains Mono',monospace;font-size:13px" oninput="renderMD()"># 标题

这是**粗体**和*斜体*。

- 列表项1
- 列表项2

\`\`\`js
console.log('hello')
\`\`\`

> 引用文本</textarea></div><div><label style="display:block;font-size:13px;color:var(--muted);margin-bottom:8px">预览</label><div id="mdPreview" class="post-content" style="border:1px solid var(--border);padding:16px;min-height:300px"></div></div></div>`,
cron:()=>`<div class="tool-row"><label>Cron表达式</label><input type="text" id="cronInput" placeholder="0 9 * * 1-5" oninput="parseCron()"></div><div class="tool-row"><label>含义</label><div class="result" id="cronMeaning"></div></div><div class="tool-row"><label>下次5次执行时间</label><div class="result" id="cronNext"></div></div>`,
qrcode:()=>`<div class="tool-row"><label>输入文本或链接</label><textarea id="qrText" placeholder="https://example.com" oninput="genQR()"></textarea></div><div style="text-align:center;padding:20px"><canvas id="qrCanvas" style="display:inline-block;border:1px solid var(--border)"></canvas></div><button class="btn btn-sm" onclick="downloadQR()">下载二维码</button>`,
qrdecode:()=>`<div class="tool-row"><label>上传二维码图片</label><input type="file" id="qrFile" accept="image/*" onchange="decodeQR(this.files[0])"></div><div class="tool-row" style="margin-top:20px"><label>识别结果</label><div class="result" id="qrDecodeResult"></div></div>`,
imgcompress:()=>`<div class="tool-row"><label>上传图片</label><input type="file" id="compressFile" accept="image/*" onchange="compressImg(this.files[0])"></div><div class="tool-row"><label>压缩质量（0-1）</label><input type="range" id="compressQuality" min="0.1" max="1" step="0.05" value="0.7" oninput="compressImg(document.getElementById('compressFile').files[0])"><span id="compressQualityVal">0.7</span></div><div id="compressResult" style="margin-top:20px"></div>`,
imgconvert:()=>`<div class="tool-row"><label>上传图片</label><input type="file" id="convertFile" accept="image/*" onchange="convertImg(this.files[0])"></div><div class="tool-row"><label>目标格式</label><select id="convertFormat"><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></div><button class="btn btn-sm" onclick="doConvertImg()">转换</button><div id="convertResult" style="margin-top:20px"></div>`,
imgbase64:()=>`<div class="tool-row"><label>上传图片</label><input type="file" id="imgb64File" accept="image/*" onchange="imgToB64(this.files[0])"></div><div class="tool-row" style="margin-top:20px"><label>Base64 Data URL（点击复制）</label><div class="result" id="imgb64Result" style="max-height:200px"></div></div>`,
imgcolor:()=>`<div class="tool-row"><label>上传图片</label><input type="file" id="colorFile" accept="image/*" onchange="loadColorImg(this.files[0])"></div><div id="colorCanvasWrap" style="text-align:center;margin:16px 0;display:none"><canvas id="colorCanvas" style="max-width:100%;cursor:crosshair"></canvas></div><div class="tool-row"><label>取色结果（点击图片取色）</label><div class="result" id="colorResult"></div></div>`,
imgresize:()=>`<div class="tool-row"><label>上传图片</label><input type="file" id="resizeFile" accept="image/*" onchange="loadResizeImg(this.files[0])"></div><div id="resizeControls" style="display:none"><div class="tool-row"><label>宽度</label><input type="number" id="resizeW"></div><div class="tool-row"><label>高度</label><input type="number" id="resizeH"></div><div class="tool-row"><label><input type="checkbox" id="resizeLock" checked onchange="document.getElementById('resizeH').disabled=this.checked"> 锁定宽高比</label></div><button class="btn btn-sm" onclick="doResize()">调整尺寸并下载</button></div>`,
color:()=>`<div class="tool-row"><label>HEX</label><input type="text" id="colHex" value="#2D5A3D" oninput="fromHexColor()"></div><div class="tool-row"><label>RGB</label><input type="text" id="colRgb" oninput="fromRgbColor()"></div><div class="tool-row"><label>HSL</label><input type="text" id="colHsl" oninput="fromHslColor()"></div><div style="width:100%;height:60px;margin-top:16px;border:1px solid var(--border)" id="colPreview"></div>`,
gradient:()=>`<div class="tool-row"><label>类型</label><select id="gradType" onchange="genGradient()"><option value="linear">线性</option><option value="radial">径向</option></select></div><div class="tool-row"><label>颜色1</label><input type="color" id="gradC1" value="#2D5A3D" onchange="genGradient()"></div><div class="tool-row"><label>颜色2</label><input type="color" id="gradC2" value="#87A878" onchange="genGradient()"></div><div class="tool-row"><label>角度（线性）/ 形状（径向）</label><input type="text" id="gradAngle" value="135deg" oninput="genGradient()"></div><div id="gradPreview" style="width:100%;height:120px;margin:16px 0;border:1px solid var(--border)"></div><div class="tool-row"><label>CSS代码（点击复制）</label><div class="result" id="gradCode" style="cursor:pointer" onclick="copyText(this.textContent)"></div></div>`,
palette:()=>`<div class="tool-row"><label>主色</label><input type="color" id="palColor" value="#2D5A3D" onchange="genPalette()"></div><div id="palResult" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:16px"></div>`,
password:()=>`<div class="tool-row"><label>长度</label><input type="number" id="pwLen" value="16" min="4" max="64"></div><div class="tool-row"><label><input type="checkbox" id="pwUpper" checked> 大写字母</label></div><div class="tool-row"><label><input type="checkbox" id="pwLower" checked> 小写字母</label></div><div class="tool-row"><label><input type="checkbox" id="pwNum" checked> 数字</label></div><div class="tool-row"><label><input type="checkbox" id="pwSym"> 特殊符号</label></div><button class="btn btn-sm" onclick="genPassword()">生成密码</button><div class="tool-row" style="margin-top:20px"><label>结果（点击复制）</label><div class="result" id="pwResult" style="cursor:pointer;font-size:16px;letter-spacing:1px" onclick="copyText(this.textContent)"></div></div>`,
random:()=>`<div class="tool-row"><label>最小值</label><input type="number" id="rndMin" value="1"></div><div class="tool-row"><label>最大值</label><input type="number" id="rndMax" value="100"></div><div class="tool-row"><label>生成数量</label><input type="number" id="rndCount" value="5" min="1" max="100"></div><div class="tool-row"><label><input type="checkbox" id="rndUnique"> 不重复</label></div><button class="btn btn-sm" onclick="genRandom()">生成</button><div class="tool-row" style="margin-top:20px"><label>结果</label><div class="result" id="rndResult"></div></div>`,
wordcount:()=>`<div class="tool-row"><label>输入文本</label><textarea id="wcInput" placeholder="粘贴文本..." oninput="countWords()"></textarea></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px"><div style="padding:16px;border:1px solid var(--border);text-align:center"><div style="font-size:24px;font-family:'Noto Serif SC',serif;font-weight:700" id="wcChars">0</div><div style="font-size:12px;color:var(--muted)">总字符</div></div><div style="padding:16px;border:1px solid var(--border);text-align:center"><div style="font-size:24px;font-family:'Noto Serif SC',serif;font-weight:700" id="wcWords">0</div><div style="font-size:12px;color:var(--muted)">单词数</div></div><div style="padding:16px;border:1px solid var(--border);text-align:center"><div style="font-size:24px;font-family:'Noto Serif SC',serif;font-weight:700" id="wcLines">0</div><div style="font-size:12px;color:var(--muted)">行数</div></div></div>`,
pomodoro:()=>`<div style="text-align:center;padding:20px 0"><div style="font-family:'JetBrains Mono',monospace;font-size:64px;font-weight:500;margin-bottom:24px" id="pomoTime">25:00</div><div style="display:flex;gap:8px;justify-content:center;margin-bottom:24px"><button class="btn" id="pomoBtn" onclick="pomoToggle()">开始</button><button class="btn btn-outline" onclick="pomoReset()">重置</button></div><div style="display:flex;gap:16px;justify-content:center;font-size:13px;color:var(--muted)"><label><input type="radio" name="pomoMode" value="25" checked onchange="pomoSetMode(25)"> 专注25分</label><label><input type="radio" name="pomoMode" value="5" onchange="pomoSetMode(5)"> 休息5分</label><label><input type="radio" name="pomoMode" value="15" onchange="pomoSetMode(15)"> 长休15分</label></div><div style="margin-top:24px;font-size:13px;color:var(--muted)" id="pomoRound">第 0 轮</div></div>`,
timer:()=>`<div style="text-align:center;padding:20px 0"><div style="font-family:'JetBrains Mono',monospace;font-size:56px;font-weight:500;margin-bottom:24px" id="timerDisplay">00:00:00.00</div><div style="display:flex;gap:8px;justify-content:center;margin-bottom:24px"><button class="btn" onclick="timerToggle()" id="timerBtn">开始</button><button class="btn btn-outline" onclick="timerReset()">重置</button><button class="btn btn-outline" onclick="timerLap()">计次</button></div><div id="timerLaps" style="text-align:left;max-width:300px;margin:0 auto;font-family:'JetBrains Mono',monospace;font-size:13px"></div></div>`
};
/* ===== 工具实现函数 ===== */
function jsonFormat(mode){try{const obj=JSON.parse($('jsonInput').value);if(mode==='format')$('jsonResult').textContent=JSON.stringify(obj,null,2);else if(mode==='compress')$('jsonResult').textContent=JSON.stringify(obj);else $('jsonResult').textContent='✓ JSON格式正确'}catch(e){$('jsonResult').textContent='✗ 错误: '+e.message}}
function b64Encode(){$('b64Result').value=btoa(unescape(encodeURIComponent($('b64Text').value)))}
function b64Decode(){try{$('b64Text').value=decodeURIComponent(escape(atob($('b64Result').value)))}catch(e){toast('解码失败')}}
function urlEncode(){$('urlResult').textContent=encodeURIComponent($('urlText').value)}
function urlDecode(){$('urlResult').textContent=decodeURIComponent($('urlText').value)}
function tsToDate(){const v=parseInt($('tsInput').value);if(!isNaN(v))$('tsDateResult').textContent=fmtTime(v*1000)}
function dateToTs(){const v=$('dateInput').value;const t=new Date(v.replace(/-/g,'/'));if(!isNaN(t))$('dateTsResult').textContent=Math.floor(t.getTime()/1000)}
function genUUID(){const n=parseInt($('uuidCount').value)||5;let s='';for(let i=0;i<n;i++)s+='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)})+'\n';$('uuidResult').textContent=s.trim();$('uuidResult').onclick=function(){copyText(this.textContent)}}
async function calcHash(){const text=$('hashInput').value;if(!text){['hashMd5','hashSha1','hashSha256','hashSha512'].forEach(id=>$(id).textContent='');return}
const buf=new TextEncoder().encode(text);
$('hashSha1').textContent=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',buf))).map(b=>b.toString(16).padStart(2,'0')).join('');
$('hashSha256').textContent=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf))).map(b=>b.toString(16).padStart(2,'0')).join('');
$('hashSha512').textContent=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-512',buf))).map(b=>b.toString(16).padStart(2,'0')).join('');
$('hashMd5').textContent='(MD5需第三方库，浏览器原生不支持)'}
function decodeJWT(){const token=$('jwtInput').value.trim();if(!token){$('jwtHeader').textContent='';$('jwtPayload').textContent='';return}try{const parts=token.split('.');$('jwtHeader').textContent=JSON.stringify(JSON.parse(atob(parts[0].replace(/-/g,'+').replace(/_/g,'/'))),null,2);$('jwtPayload').textContent=JSON.stringify(JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/'))),null,2)}catch(e){$('jwtHeader').textContent='解析失败: '+e.message}}
function testRegex(){try{const re=new RegExp($('rePattern').value,$('reFlags').value);const text=$('reText').value;const matches=text.match(re);$('reResult').textContent=matches?('匹配 '+matches.length+' 处:\n'+matches.slice(0,20).map((m,i)=>`${i+1}. ${m}`).join('\n')):'无匹配'}catch(e){$('reResult').textContent='正则错误: '+e.message}}
function doDiff(){const a=$('diffA').value.split('\n'),b=$('diffB').value.split('\n');const max=Math.max(a.length,b.length);let r='';for(let i=0;i<max;i++){if(a[i]===b[i])r+='  '+a[i]+'\n';else{if(a[i]!==undefined)r+='- '+a[i]+'\n';if(b[i]!==undefined)r+='+ '+b[i]+'\n'}}$('diffResult').textContent=r.trim();$('diffResult').style.color='var(--text)'}
function fromDec(){const v=parseInt($('decInput').value);if(!isNaN(v)){$('binInput').value=v.toString(2);$('octInput').value=v.toString(8);$('hexInput').value=v.toString(16).toUpperCase()}}
function fromBin(){const v=parseInt($('binInput').value,2);if(!isNaN(v)){$('decInput').value=v;$('octInput').value=v.toString(8);$('hexInput').value=v.toString(16).toUpperCase()}}
function fromOct(){const v=parseInt($('octInput').value,8);if(!isNaN(v)){$('decInput').value=v;$('binInput').value=v.toString(2);$('hexInput').value=v.toString(16).toUpperCase()}}
function fromHex(){const v=parseInt($('hexInput').value,16);if(!isNaN(v)){$('decInput').value=v;$('binInput').value=v.toString(2);$('octInput').value=v.toString(8)}}
function formatSQL(){let sql=$('sqlInput').value;const kw=['SELECT','FROM','WHERE','AND','OR','ORDER BY','GROUP BY','LIMIT','INSERT INTO','VALUES','UPDATE','SET','DELETE FROM','CREATE TABLE','JOIN','LEFT JOIN','RIGHT JOIN','INNER JOIN','ON','HAVING','DISTINCT','UNION','AS','IN','NOT IN','LIKE','BETWEEN','IS NULL','IS NOT NULL'];
kw.forEach(k=>{sql=sql.replace(new RegExp('\\b'+k+'\\b','gi'),'\n'+k)});
sql=sql.replace(/\n\s*\n/g,'\n').replace(/^\n/,'');
$('sqlResult').textContent=sql}
function renderMD(){const md=$('mdInput').value;let html=md.replace(/^### (.*$)/gm,'<h3>$1</h3>').replace(/^## (.*$)/gm,'<h2>$1</h2>').replace(/^# (.*$)/gm,'<h2>$1</h2>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>').replace(/^- (.*$)/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g,m=>'<ul>'+m+'</ul>').replace(/^> (.*$)/gm,'<blockquote>$1</blockquote>').replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code>$2</code></pre>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\n\n/g,'</p><p>').replace(/^/,'<p>').replace(/$/,'</p>');
$('mdPreview').innerHTML=html}
setTimeout(renderMD,100);
function parseCron(){const expr=$('cronInput').value.trim();if(!expr){$('cronMeaning').textContent='';$('cronNext').textContent='';return}
const parts=expr.split(/\s+/);if(parts.length<5){$('cronMeaning').textContent='表达式格式错误，需要5个字段';$('cronNext').textContent='';return}
const names=['分钟','小时','日','月','星期'];const meanings=parts.map((p,i)=>{if(p==='*')return`每${names[i]}`;if(p.includes('/'))return`每隔${p.split('/')[1]}${names[i]}`;return`${names[i]}=${p}`});
$('cronMeaning').textContent=meanings.join('，');
const now=new Date();let next=[];let d=new Date(now);d.setSeconds(0);for(let i=0;i<5;i++){d=new Date(d.getTime()+60000);if(matchCron(parts,d))next.push(fmtTime(d.getTime()))}
$('cronNext').textContent=next.join('\n')||'无法计算（复杂表达式）'}
function matchCron(p,d){const vals=[d.getMinutes(),d.getHours(),d.getDate(),d.getMonth()+1,d.getDay()];for(let i=0;i<5;i++){if(p[i]==='*')continue;if(p[i].includes('/')){const [,step]=p[i].split('/');if(vals[i]%parseInt(step)!==0)return false;continue}const allowed=p[i].split(',');if(!allowed.some(a=>{if(a.includes('-')){const[s,e]=a.split('-').map(Number);return vals[i]>=s&&vals[i]<=e}return parseInt(a)===vals[i]}))return false}return true}
/* ===== 二维码生成（简易实现）===== */
function genQR(){const text=$('qrText').value;const canvas=$('qrCanvas');const ctx=canvas.getContext('2d');const size=200;canvas.width=size;canvas.height=size;ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
if(!text){ctx.fillStyle='#ccc';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('输入文本生成二维码',size/2,size/2);return}
const n=25;const cell=size/n;ctx.fillStyle='#000';
let seed=0;for(let i=0;i<text.length;i++)seed=(seed*31+text.charCodeAt(i))&0xffffffff;
function rng(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}
for(let y=0;y<n;y++)for(let x=0;x<n;x++){if((x<7&&y<7)||(x>=n-7&&y<7)||(x<7&&y>=n-7))continue;if(rng()>0.5)ctx.fillRect(x*cell,y*cell,cell,cell)}
ctx.fillStyle='#000';[[0,0],[n-7,0],[0,n-7]].forEach(([ox,oy])=>{ctx.fillRect(ox*cell,oy*cell,7*cell,7*cell);ctx.fillStyle='#fff';ctx.fillRect((ox+1)*cell,(oy+1)*cell,5*cell,5*cell);ctx.fillStyle='#000';ctx.fillRect((ox+2)*cell,(oy+2)*cell,3*cell,3*cell)});
ctx.fillStyle='rgba(250,249,246,0.85)';ctx.fillRect(size/2-28,size/2-10,56,20);ctx.fillStyle='#666';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText('简易QR',size/2,size/2+4)}
function downloadQR(){const canvas=$('qrCanvas');const a=document.createElement('a');a.download='qrcode.png';a.href=canvas.toDataURL();a.click()}
function decodeQR(file){if(!file)return;const reader=new FileReader();reader.onload=e=>{$('qrDecodeResult').textContent='二维码解析需要第三方库，当前为纯静态演示版。建议使用在线工具解析。'};reader.readAsDataURL(file)}
/* ===== 图片工具 ===== */
function compressImg(file){if(!file)return;$('compressQualityVal').textContent=$('compressQuality').value;const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);const q=parseFloat($('compressQuality').value);canvas.toBlob(blob=>{const url=URL.createObjectURL(blob);$('compressResult').innerHTML=`<div style="display:flex;gap:20px;align-items:center"><img src="${url}" style="max-width:200px;max-height:200px;border:1px solid var(--border)"><div><p>原图: ${fmtSize(file.size)}</p><p>压缩后: ${fmtSize(blob.size)}</p><p>节省: ${((1-blob.size/file.size)*100).toFixed(1)}%</p><a href="${url}" download="compressed.jpg" class="btn btn-sm" style="display:inline-flex;margin-top:8px">下载</a></div></div>`},'image/jpeg',q)};img.src=e.target.result};reader.readAsDataURL(file)}
function convertImg(file){if(!file)return;window._convertFile=file}
function doConvertImg(){const file=window._convertFile;if(!file){toast('请先上传图片');return}const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);const fmt=$('convertFormat').value;canvas.toBlob(blob=>{const url=URL.createObjectURL(blob);const ext=fmt.split('/')[1];$('convertResult').innerHTML=`<div style="text-align:center"><img src="${url}" style="max-width:300px;max-height:300px;border:1px solid var(--border)"><p style="margin:12px 0">${fmtSize(blob.size)}</p><a href="${url}" download="converted.${ext}" class="btn btn-sm">下载</a></div>`},fmt)};img.src=e.target.result};reader.readAsDataURL(file)}
function imgToB64(file){if(!file)return;const reader=new FileReader();reader.onload=e=>{$('imgb64Result').textContent=e.target.result;$('imgb64Result').onclick=function(){copyText(this.textContent)}};reader.readAsDataURL(file)}
function loadColorImg(file){if(!file)return;const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{const canvas=$('colorCanvas');const maxW=500;const scale=Math.min(1,maxW/img.width);canvas.width=img.width*scale;canvas.height=img.height*scale;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);$('colorCanvasWrap').style.display='block';canvas.onclick=ev=>{const rect=canvas.getBoundingClientRect();const x=Math.floor((ev.clientX-rect.left)*(canvas.width/rect.width));const y=Math.floor((ev.clientY-rect.top)*(canvas.height/rect.height));const d=canvas.getContext('2d').getImageData(x,y,1,1).data;const hex='#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();$('colorResult').textContent=`HEX: ${hex}\nRGB: rgb(${d[0]}, ${d[1]}, ${d[2]})`}};img.src=e.target.result};reader.readAsDataURL(file)}
function loadResizeImg(file){if(!file)return;const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{$('resizeW').value=img.width;$('resizeH').value=img.height;window._resizeImg=img;$('resizeControls').style.display='block'}};img.src=e.target.result;reader.readAsDataURL(file)}
$('resizeW')&&$('resizeW').addEventListener('input',function(){if($('resizeLock').checked&&window._resizeImg){const ratio=window._resizeImg.height/window._resizeImg.width;$('resizeH').value=Math.round(this.value*ratio)}});
function doResize(){const img=window._resizeImg;if(!img){toast('请先上传图片');return}const canvas=document.createElement('canvas');canvas.width=parseInt($('resizeW').value);canvas.height=parseInt($('resizeH').value);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{const a=document.createElement('a');a.download='resized.png';a.href=URL.createObjectURL(blob);a.click()})}
/* ===== 颜色/渐变/配色 ===== */
function fromHexColor(){const hex=$('colHex').value.replace('#','');if(hex.length!==6)return;const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);$('colRgb').value=`rgb(${r}, ${g}, ${b})`;const max=Math.max(r,g,b)/255,min=Math.min(r,g,b)/255;let h=0,s=0,l=(max+min)/2;if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r/255:h=((g-b)/255/d+(g<b?6:0))/6;break;case g/255:h=((b-r)/255/d+2)/6;break;case b/255:h=((r-g)/255/d+4)/6;break}}$('colHsl').value=`hsl(${Math.round(h*360)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`;$('colPreview').style.background=$('colHex').value}
function fromRgbColor(){const m=$('colRgb').value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);if(m){const hex='#'+[m[1],m[2],m[3]].map(v=>parseInt(v).toString(16).padStart(2,'0')).join('').toUpperCase();$('colHex').value=hex;fromHexColor()}}
function fromHslColor(){const m=$('colHsl').value.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);if(m){let h=m[1]/360,s=m[2]/100,l=m[3]/100;let r,g,b;if(s===0){r=g=b=l}else{const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p};const q=l<0.5?l*(1+s):l+s-l*s;const p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3)}$('colHex').value='#'+[r,g,b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('').toUpperCase();fromHexColor()}}
setTimeout(()=>{if($('colHex'))fromHexColor()},200);
function genGradient(){if(!$('gradType'))return;const type=$('gradType').value,c1=$('gradC1').value,c2=$('gradC2').value,angle=$('gradAngle').value;const css=type==='linear'?`linear-gradient(${angle}, ${c1}, ${c2})`:`radial-gradient(${angle}, ${c1}, ${c2})`;$('gradPreview').style.background=css;$('gradCode').textContent=`background: ${css};`}
setTimeout(genGradient,100);
function genPalette(){if(!$('palColor'))return;const base=$('palColor').value;const hex=base.replace('#','');const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
const hsl=rgbToHsl(r,g,b);const colors=[];for(let i=0;i<5;i++){const h=(hsl.h+i*72)%360;const c=hslToRgb(h,hsl.s,Math.min(0.7,Math.max(0.2,hsl.l)));colors.push('#'+[c.r,c.g,c.b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase())}
$('palResult').innerHTML=colors.map(c=>`<div style="text-align:center;cursor:pointer" onclick="copyText('${c}')"><div style="height:80px;background:${c};border:1px solid var(--border)"></div><div style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:8px 0">${c}</div></div>`).join('')}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b);let h=0,s=0,l=(max+min)/2;if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break}}return{h:h*360,s,l}}
function hslToRgb(h,s,l){h/=360;let r,g,b;if(s===0){r=g=b=l}else{const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p};const q=l<0.5?l*(1+s):l+s-l*s;const p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3)}return{r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)}}
setTimeout(genPalette,100);
/* ===== 密码/随机数/字数 ===== */
function genPassword(){const len=parseInt($('pwLen').value);let chars='';if($('pwUpper').checked)chars+='ABCDEFGHIJKLMNOPQRSTUVWXYZ';if($('pwLower').checked)chars+='abcdefghijklmnopqrstuvwxyz';if($('pwNum').checked)chars+='0123456789';if($('pwSym').checked)chars+='!@#$%^&*()_+-=[]{}|;:,.<>?';if(!chars){toast('至少选一种字符类型');return}let pw='';const arr=new Uint32Array(len);crypto.getRandomValues(arr);for(let i=0;i<len;i++)pw+=chars[arr[i]%chars.length];$('pwResult').textContent=pw}
function genRandom(){const min=parseInt($('rndMin').value),max=parseInt($('rndMax').value),count=parseInt($('rndCount').value),unique=$('rndUnique').checked;if(min>=max){toast('最小值必须小于最大值');return}if(unique&&count>max-min+1){toast('不重复数量超出范围');return}const result=[];const used=new Set();while(result.length<count){const n=Math.floor(Math.random()*(max-min+1))+min;if(unique){if(!used.has(n)){used.add(n);result.push(n)}}else result.push(n)}$('rndResult').textContent=result.join(', ')}
function countWords(){const text=$('wcInput').value;$('wcChars').textContent=text.length;$('wcWords').textContent=text.trim()?text.trim().split(/\s+/).length:0;$('wcLines').textContent=text?text.split('\n').length:0}
/* ===== 番茄钟 ===== */
let pomoInterval=null,pomoSeconds=25*60,pomoRunning=false,pomoRounds=0;
function pomoSetMode(m){pomoStop();pomoSeconds=m*60;pomoUpdateDisplay()}
function pomoToggle(){if(pomoRunning)pomoStop();else pomoStart()}
function pomoStart(){pomoRunning=true;$('pomoBtn').textContent='暂停';pomoInterval=setInterval(()=>{pomoSeconds--;pomoUpdateDisplay();if(pomoSeconds<=0){pomoStop();pomoRounds++;$('pomoRound').textContent='第 '+pomoRounds+' 轮';toast('时间到！')}} ,1000)}
function pomoStop(){pomoRunning=false;$('pomoBtn').textContent='开始';clearInterval(pomoInterval)}
function pomoReset(){pomoStop();const mode=document.querySelector('input[name=pomoMode]:checked').value;pomoSeconds=parseInt(mode)*60;pomoUpdateDisplay()}
function pomoUpdateDisplay(){const m=Math.floor(pomoSeconds/60),s=pomoSeconds%60;$('pomoTime').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
/* ===== 秒表 ===== */
let timerInterval=null,timerMs=0,timerRunning=false,timerLaps=[];
function timerToggle(){if(timerRunning){timerRunning=false;$('timerBtn').textContent='继续';clearInterval(timerInterval)}else{timerRunning=true;$('timerBtn').textContent='暂停';const start=Date.now()-timerMs;timerInterval=setInterval(()=>{timerMs=Date.now()-start;timerUpdateDisplay()},10)}}
function timerReset(){timerRunning=false;clearInterval(timerInterval);timerMs=0;timerLaps=[];$('timerBtn').textContent='开始';timerUpdateDisplay();$('timerLaps').innerHTML=''}
function timerLap(){if(timerMs>0){timerLaps.unshift(timerMs);$('timerLaps').innerHTML=timerLaps.map((t,i)=>`<div style="padding:4px 0;border-bottom:1px solid var(--border)">#${timerLaps.length-i} ${fmtTimer(t)}</div>`).join('')}}
function timerUpdateDisplay(){$('timerDisplay').textContent=fmtTimer(timerMs)}
function fmtTimer(ms){const h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60,cs=Math.floor(ms/10)%100;return[h,m,s].map(v=>String(v).padStart(2,'0')).join(':')+'.'+String(cs).padStart(2,'0')}
/* ===== 云盘（云端存储）===== */
let driveLoading=false;
async function uploadDriveFiles(files){
  if(!apiBase()){toast('请先配置API');location.hash='settings';return}
  for(const file of files){
    try{
      $('driveUploadStatus').textContent='上传中: '+file.name+' 0%';
      const res=await apiUpload('/api/drive/upload',file,p=>{$('driveUploadStatus').textContent='上传中: '+file.name+' '+p+'%'});
      if(res)$('driveUploadStatus').textContent='已上传: '+file.name;
    }catch(e){$('driveUploadStatus').textContent='上传失败: '+file.name}
  }
  setTimeout(()=>{$('driveUploadStatus').textContent=''},3000);
  renderDrive();
}
async function renderDrive(){
  if(!apiBase()){$('driveList').innerHTML='<div class="drive-empty">请先在<a href="#settings" style="color:var(--accent)">设置</a>中配置API地址</div>';$('driveStorageText').textContent='未配置';return}
  if(driveLoading)return;driveLoading=true;
  $('driveList').innerHTML='<div class="drive-empty">加载中...</div>';
  const data=await apiRequest('/api/drive/list');
  driveLoading=false;
  if(!data)return;
  const files=data.files||[];
  const total=data.totalSize||0;
  $('driveStorageText').textContent=fmtSize(total)+' 已用 / '+fmtSize(data.quota||10737418240);
  $('driveStorageFill').style.width=Math.min(100,total/(data.quota||10737418240)*100)+'%';
  $('drivePath').textContent='/';
  if(files.length===0){$('driveList').innerHTML='<div class="drive-empty">暂无文件，点击上方按钮上传</div>';return}
  $('driveList').innerHTML=files.map(f=>`<div class="drive-item">
<span class="drive-icon">${getFileIcon(f.name)}</span>
<span class="drive-name" onclick="downloadDriveFile('${f.id}','${f.name}')">${f.name}</span>
<span class="drive-meta">${fmtSize(f.size)} · ${fmtTime(f.createdAt)}</span>
<span class="drive-actions"><button class="btn btn-sm btn-outline" onclick="copyText('${apiBase()}/api/drive/download/${f.id}')">复制链接</button><button class="btn btn-sm btn-outline" onclick="deleteDriveFile('${f.id}')">删除</button></span>
</div>`).join('')
}
function getFileIcon(name){const ext=name.split('.').pop().toLowerCase();if(['jpg','jpeg','png','gif','webp','svg'].includes(ext))return'🖼️';if(['mp4','webm','mov','avi'].includes(ext))return'🎬';if(['mp3','wav','ogg','flac'].includes(ext))return'🎵';if(['pdf'].includes(ext))return'📕';if(['doc','docx','txt','md'].includes(ext))return'📄';if(['zip','rar','7z'].includes(ext))return'📦';return'📎'}
function downloadDriveFile(id,name){window.open(apiBase()+'/api/drive/download/'+id,'_blank')}
async function deleteDriveFile(id){if(!confirm('确定删除？'))return;await apiRequest('/api/drive/'+id,{method:'DELETE'});renderDrive()}
/* ===== 网址导航（云端）===== */
let navCache=[];
async function renderNav(){
  const q=($('navSearch').value||'').toLowerCase();
  if(!apiBase()){$('navSections').innerHTML='<p style="color:var(--muted);text-align:center;padding:40px">请先配置API</p>';return}
  if(navCache.length===0){const data=await apiRequest('/api/nav');if(data)navCache=data.items||[]}
  const bms=navCache.filter(b=>!q||b.name.toLowerCase().includes(q)||b.url.toLowerCase().includes(q)||(b.cat||'').toLowerCase().includes(q));
  const cats=[...new Set(bms.map(b=>b.cat||'其他'))];
  $('navSections').innerHTML=cats.map(cat=>`<div class="nav-section"><div class="nav-section-title">${cat}</div><div class="nav-items">${bms.filter(b=>(b.cat||'其他')===cat).map(b=>`<a href="${b.url}" target="_blank" class="nav-item"><span class="nav-item-icon">${b.icon||'🔗'}</span><span>${b.name}</span><span class="nav-item-del" onclick="event.preventDefault();event.stopPropagation();delBookmark('${b.id}')">×</span></a>`).join('')}</div></div>`).join('')||'<p style="color:var(--muted);text-align:center;padding:40px">无匹配结果</p>'
}
async function addBookmark(){
  const name=$('bmName').value.trim(),url=$('bmUrl').value.trim(),cat=$('bmCat').value.trim()||'其他',icon=$('bmIcon').value.trim();
  if(!name||!url){toast('请填写名称和网址');return}
  const res=await apiRequest('/api/nav',{method:'POST',body:JSON.stringify({name,url,cat,icon})});
  if(res){navCache=[];$('bmName').value='';$('bmUrl').value='';$('bmCat').value='';$('bmIcon').value='';renderNav();toast('已添加')}
}
async function delBookmark(id){await apiRequest('/api/nav/'+id,{method:'DELETE'});navCache=[];renderNav()}
/* ===== 短链接（云端）===== */
let shortCache=[];
async function createShortLink(){
  const url=$('shortInput').value.trim();
  if(!url){toast('请输入链接');return}
  if(!/^https?:\/\//.test(url)){toast('请输入以http://或https://开头的链接');return}
  const res=await apiRequest('/api/short',{method:'POST',body:JSON.stringify({url})});
  if(res){
    const shortUrl=apiBase()+'/s/'+res.code;
    $('shortResult').innerHTML=`<div class="short-result">短链接: <a href="${shortUrl}" target="_blank">${shortUrl}</a> <button class="btn btn-sm btn-outline" onclick="copyText('${shortUrl}')">复制</button></div>`;
    $('shortInput').value='';shortCache=[];renderShortList();
  }
}
async function renderShortList(){
  if(!apiBase()){$('shortList').innerHTML='<div class="drive-empty">请先配置API</div>';return}
  if(shortCache.length===0){const data=await apiRequest('/api/short/list');if(data)shortCache=data.items||[]}
  $('shortList').innerHTML=shortCache.length?shortCache.map(s=>`<div class="short-item"><span class="short-code" onclick="copyText('${apiBase()}/s/${s.code}')">#${s.code}</span><span class="short-original" title="${s.url}">${s.url}</span><span class="short-views">${s.views||0}次</span><button class="btn btn-sm btn-outline" onclick="delShortLink('${s.code}')">删除</button></div>`).join(''):'<div class="drive-empty">暂无短链</div>'
}
async function delShortLink(code){await apiRequest('/api/short/'+code,{method:'DELETE'});shortCache=[];renderShortList()}
/* ===== 代码片段（云端）===== */
let snippetCache=[];
async function renderSnippets(){
  if(!apiBase()){$('snippetList').innerHTML='<div class="drive-empty">请先配置API</div>';return}
  if(snippetCache.length===0){const data=await apiRequest('/api/snippets');if(data)snippetCache=data.items||[]}
  $('snippetList').innerHTML=snippetCache.length?`<div class="snippet-list">${snippetCache.map((s,i)=>`<div class="snippet-item" onclick="viewSnippet(${i})"><div class="snippet-title">${s.title}</div><div class="snippet-meta">${s.lang} · ${fmtTime(s.createdAt)} · ${(s.code||'').length}字符</div><button class="btn btn-sm btn-outline" style="float:right" onclick="event.stopPropagation();delSnippet('${s.id}')">删除</button></div>`).join('')}</div>`:'<div class="drive-empty">暂无代码片段</div>'
}
async function addSnippet(){
  const title=$('snipTitle').value.trim(),lang=$('snipLang').value,code=$('snipCode').value;
  if(!title||!code){toast('请填写标题和代码');return}
  const res=await apiRequest('/api/snippets',{method:'POST',body:JSON.stringify({title,lang,code})});
  if(res){snippetCache=[];$('snipTitle').value='';$('snipCode').value='';renderSnippets();toast('已保存')}
}
function viewSnippet(i){const s=snippetCache[i];if(!s)return;$('snipViewTitle').textContent=s.title+' ('+s.lang+')';$('snipViewCode').textContent=s.code;window._currentSnippet=s.code;$('snippetViewer').style.display='block';$('snippetViewer').scrollIntoView({behavior:'smooth'})}
function copySnippetCode(){copyText(window._currentSnippet||'')}
async function delSnippet(id){await apiRequest('/api/snippets/'+id,{method:'DELETE'});snippetCache=[];renderSnippets()}
/* ===== 博客 ===== */
const BLOG_POSTS=[
{id:1,title:'为什么我做了一个带云存储的个人工具站',date:'2026-10-10',excerpt:'纯静态不够用，云盘必须能跨设备。用Cloudflare Workers+R2+KV搭了个轻量后端，免费额度够用。',content:`
<h2>起因</h2>
<p>第一版是纯静态，云盘用IndexedDB存在浏览器本地。但换个设备文件就没了，这算什么云盘？所以加了后端。</p>
<h2>方案</h2>
<p>前端还是单文件HTML，部署在GitHub Pages。后端用Cloudflare Workers，文件存在R2对象存储，轻量数据（短链/导航/片段/留言）存在KV。</p>
<h2>技术栈</h2>
<ul><li>前端：原生 HTML / CSS / JavaScript，无框架</li><li>后端：Cloudflare Workers</li><li>文件存储：Cloudflare R2（10GB免费）</li><li>键值存储：Cloudflare KV（10万次读取/天免费）</li><li>28个工具全部纯前端运行</li></ul>
<h2>成本</h2>
<p>个人使用量基本在免费额度内：R2 10GB存储 + 每月100万次A类操作、1000万次B类操作；KV 10万次读取/天。域名用FreeDomain的免费域名，DNS走Cloudflare。总成本0元。</p>
<blockquote>工具应该安静地完成任务，而不是吸引注意力。</blockquote>
`},
{id:2,title:'Cloudflare R2 上手笔记',date:'2026-10-08',excerpt:'S3兼容的对象存储，10GB免费，无出站流量费。配合Workers做文件存储很合适。',content:`
<h2>什么是 R2</h2>
<p>R2是Cloudflare推出的对象存储服务，API兼容S3。最大的卖点是**没有出站流量费**——从R2下载文件不收费，这对个人网站来说很重要。</p>
<h2>免费额度</h2>
<ul><li>存储：10GB/月</li><li>A类操作（写、删、列）：100万次/月</li><li>B类操作（读）：1000万次/月</li></ul>
<h2>和Workers配合</h2>
<p>在Workers里绑定R2存储桶后，可以直接通过env.BUCKET.get()/put()/delete()操作文件。上传用form-data解析，下载直接返回Response。</p>
<pre><code>// 上传
const formData = await request.formData();
const file = formData.get('file');
await env.BUCKET.put(file.name, file.stream(), {
  httpMetadata: { contentType: file.type }
});
// 下载
const obj = await env.BUCKET.get(key);
return new Response(obj.body, {
  headers: { 'Content-Type': obj.httpMetadata?.contentType }
});</code></pre>
<h2>注意事项</h2>
<p>R2没有内置的公开访问URL，必须通过Workers或自定义域名来访问文件。这反而更安全，可以在Workers里加鉴权。</p>
`},
{id:3,title:'28个前端工具是怎么塞进一个HTML文件的',date:'2026-09-20',excerpt:'没有构建工具，没有框架，28个工具全部写在一个HTML文件里。聊聊代码组织和体积控制。',content:`
<h2>代码组织</h2>
<p>28个工具共享同一个渲染框架。每个工具定义一个 id、名称、分类、描述，以及一个渲染函数。渲染函数返回 HTML 字符串，插入到工具详情面板中。</p>
<h2>体积控制</h2>
<ul><li>不引入任何第三方库，全部用浏览器原生 API</li><li>哈希计算用 Web Crypto API</li><li>图片处理用 Canvas</li><li>二维码用简易算法实现</li><li>Markdown 用正则表达式做基础渲染</li></ul>
<h2>最终体积</h2>
<p>整个 HTML 文件约 80KB，gzip 后约 25KB。比很多网站的一张图片还小。</p>
`}
];
function renderBlog(){const hash=location.hash.slice(1);if(hash.startsWith('blog/')){const id=parseInt(hash.split('/')[1]);const post=BLOG_POSTS.find(p=>p.id===id);if(post){$('blogList').style.display='none';$('blogDetail').style.display='block';$('blogDetail').innerHTML=`<button class="tool-back" onclick="location.hash='blog'">← 返回列表</button><h2 style="font-family:'Noto Serif SC',serif;font-size:28px;font-weight:700;margin:16px 0 8px">${post.title}</h2><p style="font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-bottom:32px">${post.date}</p><div class="post-content">${post.content}</div>`;return}}$('blogList').style.display='block';$('blogDetail').style.display='none';$('blogList').innerHTML=BLOG_POSTS.map(p=>`<div class="post-item" onclick="location.hash='blog/${p.id}'"><div class="post-title">${p.title}</div><div class="post-meta">${p.date}</div><div class="post-excerpt">${p.excerpt}</div></div>`).join('')}
/* ===== 留言板（云端）===== */
let gbCache=[];
async function renderGuestbook(){
  if(!apiBase()){$('guestbookList').innerHTML='<div class="guestbook-empty">请先配置API</div>';return}
  if(gbCache.length===0){const data=await apiRequest('/api/guestbook');if(data)gbCache=data.items||[]}
  $('guestbookList').innerHTML=gbCache.length?gbCache.map(g=>`<div class="guestbook-item"><div class="guestbook-head"><span class="guestbook-name">${g.name}</span><span class="guestbook-time">${fmtTime(g.createdAt)}</span></div><div class="guestbook-msg">${(g.msg||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div></div>`).join(''):'<div class="guestbook-empty">还没有留言，来说点什么吧</div>'
}
async function addGuestbook(){
  const name=$('gbName').value.trim()||'匿名',msg=$('gbMsg').value.trim();
  if(!msg){toast('请输入留言内容');return}
  const res=await apiRequest('/api/guestbook',{method:'POST',body:JSON.stringify({name,msg})});
  if(res){gbCache=[];$('gbMsg').value='';renderGuestbook();toast('留言成功')}
}
/* ===== 设置页面 ===== */
function renderSettings(){
  const cfg=getApiCfg();
  $('setApiBase').value=cfg.baseUrl||'';
  $('setApiKey').value=cfg.apiKey||'';
  $('setStatus').textContent=cfg.baseUrl?'已配置':'未配置';
}
function saveSettings(){
  const baseUrl=$('setApiBase').value.trim().replace(/\/$/,'');
  const apiKey=$('setApiKey').value.trim();
  saveApiCfg({baseUrl,apiKey});
  navCache=[];shortCache=[];snippetCache=[];gbCache=[];
  $('setStatus').textContent='已保存';
  toast('设置已保存');
}
async function testApi(){
  if(!apiBase()){toast('请先填写API地址');return}
  const res=await apiRequest('/api/ping');
  if(res)$('setStatus').textContent='连接成功: '+res.message;
}
/* ===== 路由增强 ===== */
const origRouter=router;
router=function(){
  const hash=location.hash.slice(1)||'home';
  origRouter();
  if(hash==='nav')renderNav();
  if(hash==='short')renderShortList();
  if(hash==='snippets')renderSnippets();
  if(hash.startsWith('blog'))renderBlog();
  if(hash==='guestbook')renderGuestbook();
  if(hash==='drive')renderDrive();
  if(hash==='settings')renderSettings();
};
/* ===== 初始化 ===== */
router();
setInterval(()=>{const el=$('tsNow');if(el)el.textContent=Math.floor(Date.now()/1000)},1000);
