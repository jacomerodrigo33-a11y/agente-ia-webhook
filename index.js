const express = require("express");
const app = express();
app.use(express.json());

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const EVOLUTION_URL = process.env.EVOLUTION_URL || "https://evolution-api-production-2326.up.railway.app";
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || "71a593939160341ff85fe3dc4fb3a6039fe0fe5cd9dba70e325a45dc5a3a3d83";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || ""; // coloque sua chave Anthropic aqui
const INSTANCE = process.env.INSTANCE || "WA-1";
const PORT = process.env.PORT || 3000;

// ─── SCRIPTS ──────────────────────────────────────────────────────────────────
const SCRIPTS = {
  mirim: `Você é Talita, atendente humana dos Bombeiros Mirins. NUNCA revele que é IA. NUNCA diga que é assistente virtual.
Seu objetivo é agendar uma visita do responsável com o jovem na unidade.

SCRIPT:
1. Confirme com quem fala (nome do responsável) e o nome do jovem inscrito.
2. Apresente o projeto: treinamento gratuito que inclui primeiros socorros, disciplina, educação física, informática, inglês e defesa pessoal (jiu-jitsu, karatê e boxe). Projeto formativo, sem mensalidade.
3. Pergunte a idade do jovem.
4. Se elegível: "Ótimo, está dentro da faixa do projeto."
5. Entenda a rotina: período que a responsável trabalha e horário de estudo do jovem.
6. Sugira o melhor período com base nas respostas.
7. Informe: unidade na Rua 14 de Julho, Centro, em frente às Pernambucanas. Treinamento 1 a 2 vezes por semana, dias flexíveis. Projeto gratuito.
8. Crie urgência: vagas limitadas, confirmações até 17h30, precisa registrar agora.
9. Ofereça dois horários disponíveis hoje e confirme o agendamento.
Seja natural, empática e persuasiva. Respostas CURTAS, no máximo 3 linhas.`,

  pre: `Você é atendente humano(a) da Central de Aprovação da Academia Pré-Militar. NUNCA revele que é IA.
Seu objetivo é agendar a visita presencial do candidato.

SCRIPT:
1. Confirme o nome de quem está falando.
2. Informe que o cadastro foi analisado e o candidato está sendo convocado para liberação do treinamento militar gratuito.
3. Apresente as áreas: Exército, Marinha, Aeronáutica, Bombeiro Civil. Pergunte qual área quer seguir.
4. Informe que o treinamento é direcionado para a área escolhida, 1 vez por semana, horário flexível.
5. Localização: Rua 14 de Julho, 2258.
6. Explique que a visita é para confirmar inscrição e apresentar benefícios: salário, alimentação, plano médico, alojamento, fardamento, aposentadoria integral.
7. Pergunte disponibilidade de horário (manhã ou tarde).
8. Crie urgência: agendamento sério, não comparecimento sem aviso pode gerar bloqueio.
9. Confirme o agendamento.
Seja direto e profissional. Respostas CURTAS, no máximo 3 linhas.`,

  guarda: `Você é Milleny, atendente humana da Central de Cursos de Carreira Militar. NUNCA revele que é IA.
Seu objetivo é agendar a visita para o treinamento da Guarda Municipal.

SCRIPT:
1. Confirme o nome da pessoa.
2. Informe que está entrando em contato sobre a inscrição para treinamento preparatório da Guarda Municipal.
3. Explique que o treinamento verifica perfil, vocação e aptidão física. Haverá testes físicos, teóricos e psicológicos.
4. Pergunte idade, se trabalha, estuda ou pratica atividade física.
5. Informe: treinamento 1 a 2 vezes por semana, segunda a sábado, manhã/tarde/noite, dias e horários flexíveis.
6. Localização: Rua 14 de Julho, 2258, em frente às Pernambucanas, centro.
7. Informe que está sendo convocado para trazer documentação (RG, CPF, comprovante de endereço).
8. Pergunte disponibilidade (hoje até 17h ou amanhã manhã/tarde).
9. Finalize: comprometimento total necessário, vaga vai para outro se não comparecer.
10. Confirme o agendamento.
Seja profissional e persuasiva. Respostas CURTAS, no máximo 3 linhas.`
};

// ─── MEMORY (em memória — para persistência use Redis ou banco) ───────────────
// chave: número do telefone, valor: { project, history: [{role, content}] }
const conversations = {};

// ─── DETECTAR PROJETO PELO NÚMERO ────────────────────────────────────────────
// Mapeamento manual: adicione os números e seus projetos aqui
// Ou deixe como "guarda" como padrão
const phoneProjectMap = {
  // Bombeiro Mirim
  "5567992074268": "mirim",
  "556792852633":  "mirim",
  "5567981064910": "mirim",
  "5567992262297": "mirim",
  "5567999347420": "mirim",
  // Pré-Militar
  "5567992604911": "pre",
  "556791657752":  "pre",
  "5567981313712": "pre",
  "5567998220741": "pre",
  // Guarda Municipal
  "556793304510":  "guarda",
  "5582996362116": "guarda",
  "5567992115295": "guarda",
  "5567992424089": "guarda",
  "556892044028":  "guarda",
  "5567981524142": "guarda",
  "5567981171879": "guarda",
  "556798295452":  "guarda",
  "556791596563":  "guarda",
  "556796496889":  "guarda",
  "5567991611104": "guarda",
  "5567991084524": "guarda",
  "5567996091213": "guarda",
  "5567991491784": "guarda",
};

function getProject(phone) {
  return phoneProjectMap[phone] || "guarda";
}

// ─── CLAUDE AI ────────────────────────────────────────────────────────────────
async function callClaude(history, project) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SCRIPTS[project],
      messages: history
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.content[0].text;
}

// ─── ENVIAR WHATSAPP ──────────────────────────────────────────────────────────
async function sendWhatsApp(number, text) {
  const response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_KEY
    },
    body: JSON.stringify({ number, text })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

// ─── WEBHOOK ──────────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responde rápido para a Evolution não retentar

  try {
    const body = req.body;

    // Filtra apenas mensagens recebidas (não as enviadas pelo bot)
    if (body.event !== "messages.upsert") return;
    const msg = body.data?.message;
    if (!msg) return;

    // Ignora mensagens enviadas pelo próprio número
    if (body.data?.key?.fromMe) return;

    // Ignora grupos
    const remoteJid = body.data?.key?.remoteJid || "";
    if (remoteJid.includes("@g.us")) return;

    // Extrai número e texto
    const phone = remoteJid.replace("@s.whatsapp.net", "");
    const text =
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.buttonsResponseMessage?.selectedDisplayText ||
      "";

    if (!text) return;

    console.log(`[WEBHOOK] Mensagem de ${phone}: ${text}`);

    // Recupera ou inicia conversa
    if (!conversations[phone]) {
      conversations[phone] = {
        project: getProject(phone),
        history: []
      };
    }

    const conv = conversations[phone];
    conv.history.push({ role: "user", content: text });

    // Limita histórico a 20 mensagens para economizar tokens
    if (conv.history.length > 20) {
      conv.history = conv.history.slice(-20);
    }

    // Chama Claude
    console.log(`[AI] Processando para ${phone} (projeto: ${conv.project})...`);
    const aiReply = await callClaude(conv.history, conv.project);

    conv.history.push({ role: "assistant", content: aiReply });

    // Envia resposta
    console.log(`[WA] Enviando para ${phone}: ${aiReply.substring(0, 60)}...`);
    await sendWhatsApp(phone, aiReply);

    console.log(`[OK] Resposta enviada para ${phone}`);
  } catch (err) {
    console.error("[ERRO]", err.message || err);
  }
});

// ─── ROTA PARA INICIAR CONVERSA (disparo manual) ─────────────────────────────
app.post("/start", async (req, res) => {
  try {
    const { phone, project } = req.body;
    if (!phone) return res.status(400).json({ error: "phone obrigatório" });

    const proj = project || getProject(phone);

    // Inicia histórico vazio e pede a primeira mensagem da IA
    conversations[phone] = { project: proj, history: [] };

    const aiReply = await callClaude([], proj);
    conversations[phone].history.push({ role: "assistant", content: aiReply });

    await sendWhatsApp(phone, aiReply);

    res.json({ ok: true, message: aiReply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROTA PARA DISPARAR EM LOTE ───────────────────────────────────────────────
app.post("/start-batch", async (req, res) => {
  const { contacts } = req.body;
  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: "contacts[] obrigatório" });
  }

  res.json({ ok: true, total: contacts.length, message: "Disparos iniciados em background" });

  // Processa em background com delay de 3s entre cada um
  (async () => {
    for (const c of contacts) {
      try {
        const proj = c.project || getProject(c.phone);
        conversations[c.phone] = { project: proj, history: [] };
        const aiReply = await callClaude([], proj);
        conversations[c.phone].history.push({ role: "assistant", content: aiReply });
        await sendWhatsApp(c.phone, aiReply);
        console.log(`[BATCH] Iniciado com ${c.phone}`);
      } catch (e) {
        console.error(`[BATCH ERROR] ${c.phone}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 3000)); // 3s entre disparos
    }
  })();
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/status", (req, res) => {
  res.json({
    status: "online",
    conversations: Object.keys(conversations).length,
    instance: INSTANCE
  });
});

// ─── APP FRONTEND ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Disparo IA — Agendamentos</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Clash+Display:wght@400;500;600;700&display=swap');
  :root {
    --bg: #f5f2eb; --surface: #faf8f3; --surface2: #edeae1; --border: #d8d3c8;
    --ink: #1a1a18; --muted: #8a8478; --mirim: #c0392b; --pre: #d4860a;
    --guarda: #1a6b9a; --green: #2d7a4f; --green-bg: #e8f5ee; --red-bg: #fdf0ee;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--ink); font-family: 'DM Mono', monospace; min-height: 100vh; padding: 0; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 40px 24px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 40px; gap: 16px; }
  .title-block h1 { font-family: 'Clash Display','DM Mono',monospace; font-size: 2rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; }
  .title-block p { font-size: 0.72rem; color: var(--muted); margin-top: 6px; letter-spacing: 0.05em; }
  .instance-pill { display: flex; align-items: center; gap: 7px; padding: 8px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 100px; font-size: 0.68rem; color: var(--muted); white-space: nowrap; }
  .dot-live { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: blink 2s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; margin-bottom: 20px; }
  .panel-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .panel-title { font-size: 0.65rem; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .add-area { padding: 20px; }
  .input-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; }
  .phone-input { background: var(--bg); border: 1.5px solid var(--border); color: var(--ink); font-family: 'DM Mono',monospace; font-size: 0.82rem; padding: 11px 14px; border-radius: 10px; outline: none; width: 100%; transition: border-color 0.15s; }
  .phone-input:focus { border-color: var(--ink); }
  .phone-input::placeholder { color: var(--muted); }
  .project-select { background: var(--bg); border: 1.5px solid var(--border); color: var(--ink); font-family: 'DM Mono',monospace; font-size: 0.78rem; padding: 11px 30px 11px 12px; border-radius: 10px; outline: none; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8478' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; min-width: 160px; }
  .btn { padding: 11px 18px; border-radius: 10px; font-family: 'DM Mono',monospace; font-size: 0.78rem; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; white-space: nowrap; }
  .btn-add { background: var(--ink); color: var(--bg); }
  .btn-add:hover { opacity: 0.85; }
  .or-divider { text-align: center; font-size: 0.65rem; color: var(--muted); margin: 14px 0; position: relative; }
  .or-divider::before,.or-divider::after { content:''; position:absolute; top:50%; width:45%; height:1px; background:var(--border); }
  .or-divider::before { left:0; } .or-divider::after { right:0; }
  .bulk-area { display: flex; flex-direction: column; gap: 10px; }
  .bulk-textarea { background: var(--bg); border: 1.5px solid var(--border); color: var(--ink); font-family: 'DM Mono',monospace; font-size: 0.75rem; padding: 12px 14px; border-radius: 10px; outline: none; resize: vertical; min-height: 90px; line-height: 1.6; width: 100%; }
  .bulk-textarea:focus { border-color: var(--ink); }
  .bulk-textarea::placeholder { color: var(--muted); }
  .bulk-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .bulk-hint { font-size: 0.65rem; color: var(--muted); }
  .btn-import { background: var(--ink); color: var(--bg); }
  .btn-import:hover { opacity: 0.85; }
  .queue-empty { padding: 32px 20px; text-align: center; font-size: 0.72rem; color: var(--muted); }
  .queue-table { width: 100%; border-collapse: collapse; }
  .queue-table th { padding: 10px 20px; text-align: left; font-size: 0.62rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); background: var(--surface2); }
  .queue-table td { padding: 12px 20px; font-size: 0.78rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .queue-table tr:last-child td { border-bottom: none; }
  .queue-table tr:hover td { background: var(--surface2); }
  .project-badge { display: inline-block; padding: 3px 8px; border-radius: 5px; font-size: 0.62rem; font-weight: 500; letter-spacing: 0.05em; }
  .badge-mirim { background: #fdecea; color: var(--mirim); border: 1px solid #f5c6c2; }
  .badge-pre { background: #fef3e2; color: var(--pre); border: 1px solid #f5dca8; }
  .badge-guarda { background: #e8f0f7; color: var(--guarda); border: 1px solid #b8d0e8; }
  .status-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 0.62rem; }
  .chip-dot { width: 5px; height: 5px; border-radius: 50%; }
  .chip-idle { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
  .chip-idle .chip-dot { background: var(--muted); }
  .chip-sending { background: #fff8e8; color: var(--pre); border: 1px solid #f5dca8; }
  .chip-sending .chip-dot { background: var(--pre); animation: blink 0.8s infinite; }
  .chip-active { background: var(--green-bg); color: var(--green); border: 1px solid #a8d5bc; }
  .chip-active .chip-dot { background: var(--green); }
  .chip-done { background: #e8f0f7; color: var(--guarda); border: 1px solid #b8d0e8; }
  .chip-done .chip-dot { background: var(--guarda); }
  .chip-error { background: var(--red-bg); color: var(--mirim); border: 1px solid #f5c6c2; }
  .chip-error .chip-dot { background: var(--mirim); }
  .remove-btn { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 0.8rem; padding: 4px 8px; border-radius: 5px; transition: all 0.1s; }
  .remove-btn:hover { background: var(--red-bg); color: var(--mirim); }
  .launch-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; margin-bottom: 20px; }
  .launch-info { font-size: 0.72rem; color: var(--muted); }
  .launch-count { font-size: 1.4rem; font-weight: 700; color: var(--ink); }
  .btn-launch { padding: 13px 28px; background: var(--ink); color: var(--bg); border-radius: 12px; font-size: 0.85rem; font-weight: 500; border: none; cursor: pointer; font-family: 'DM Mono',monospace; transition: all 0.15s; }
  .btn-launch:hover { background: #333; }
  .btn-launch:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-stop { padding: 13px 28px; background: var(--red-bg); color: var(--mirim); border-radius: 12px; font-size: 0.85rem; font-weight: 500; border: 1px solid #f5c6c2; cursor: pointer; font-family: 'DM Mono',monospace; transition: all 0.15s; display: none; }
  .progress-bar-wrap { height: 4px; background: var(--surface2); border-radius: 100px; overflow: hidden; flex: 1; }
  .progress-bar-fill { height: 100%; background: var(--ink); border-radius: 100px; transition: width 0.4s ease; width: 0%; }
  .log-panel { background: var(--ink); border-radius: 16px; overflow: hidden; margin-bottom: 20px; display: none; }
  .log-panel.visible { display: block; }
  .log-header { padding: 12px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 0.62rem; color: rgba(255,255,255,0.4); letter-spacing: 0.1em; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; }
  .log-body { padding: 14px 18px; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
  .log-line { font-size: 0.68rem; font-family: 'DM Mono',monospace; color: rgba(255,255,255,0.5); line-height: 1.5; }
  .log-ok { color: #4ade80; } .log-err { color: #f87171; } .log-info { color: #93c5fd; } .log-warn { color: #fbbf24; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="title-block"><h1>Disparo IA</h1><p>AGENDAMENTOS AUTOMÁTICOS VIA WHATSAPP</p></div>
    <div class="instance-pill"><div class="dot-live"></div>WA-1 • Evolution API</div>
  </div>
  <div class="panel">
    <div class="panel-header"><span class="panel-title">Adicionar Contatos</span></div>
    <div class="add-area">
      <div class="input-row">
        <input type="text" class="phone-input" id="singlePhone" placeholder="55 67 9 9999-9999" onkeydown="if(event.key==='Enter') addSingle()">
        <select class="project-select" id="singleProject">
          <option value="mirim">🔴 Bombeiro Mirim</option>
          <option value="pre">🟡 Pré-Militar</option>
          <option value="guarda">🔵 Guarda Municipal</option>
        </select>
        <button class="btn btn-add" onclick="addSingle()">+ Adicionar</button>
      </div>
      <div class="or-divider">ou cole vários números</div>
      <div class="bulk-area">
        <select class="project-select" id="bulkProject" style="width:200px">
          <option value="mirim">🔴 Bombeiro Mirim</option>
          <option value="pre">🟡 Pré-Militar</option>
          <option value="guarda">🔵 Guarda Municipal</option>
        </select>
        <textarea class="bulk-textarea" id="bulkText" placeholder="Cole os números aqui, um por linha:&#10;5567992115295&#10;5567992424089"></textarea>
        <div class="bulk-footer">
          <span class="bulk-hint">Um número por linha • Com ou sem espaços/traços</span>
          <button class="btn btn-import" onclick="importBulk()">Importar</button>
        </div>
      </div>
    </div>
  </div>
  <div class="panel" id="queuePanel">
    <div class="panel-header"><span class="panel-title">Fila de Disparo</span><span style="font-size:0.68rem;color:var(--muted)" id="queueCount">0 contatos</span></div>
    <div id="queueEmpty" class="queue-empty">Nenhum contato adicionado ainda.</div>
    <table class="queue-table" id="queueTable" style="display:none">
      <thead><tr><th>Telefone</th><th>Projeto</th><th>Status</th><th>Mensagens</th><th></th></tr></thead>
      <tbody id="queueBody"></tbody>
    </table>
  </div>
  <div class="launch-bar">
    <div><div class="launch-count" id="launchCount">0</div><div class="launch-info">contatos na fila</div></div>
    <div class="progress-bar-wrap" id="progressWrap" style="display:none"><div class="progress-bar-fill" id="progressFill"></div></div>
    <div style="display:flex;gap:8px">
      <button class="btn-stop" id="stopBtn" onclick="stopAll()">■ Parar</button>
      <button class="btn-launch" id="launchBtn" onclick="launchAll()" disabled>🚀 Disparar tudo</button>
    </div>
  </div>
  <div class="log-panel" id="logPanel">
    <div class="log-header"><span>Log de execução</span><span id="logCount">0 eventos</span></div>
    <div class="log-body" id="logBody"></div>
  </div>
</div>
<script>
let contacts = [], running = false, stopFlag = false, nextId = 1, logCount = 0;

function cleanPhone(p) { return p.replace(/\\D/g, ""); }
function projectLabel(p) { return {mirim:"🔴 Bombeiro Mirim",pre:"🟡 Pré-Militar",guarda:"🔵 Guarda Municipal"}[p]; }
function badgeClass(p) { return {mirim:"badge-mirim",pre:"badge-pre",guarda:"badge-guarda"}[p]; }
function statusChip(s) {
  const map = {
    idle: '<span class="status-chip chip-idle"><span class="chip-dot"></span>Aguardando</span>',
    sending: '<span class="status-chip chip-sending"><span class="chip-dot"></span>Enviando...</span>',
    active: '<span class="status-chip chip-active"><span class="chip-dot"></span>Em conversa</span>',
    done: '<span class="status-chip chip-done"><span class="chip-dot"></span>Agendado</span>',
    error: '<span class="status-chip chip-error"><span class="chip-dot"></span>Erro</span>'
  };
  return map[s] || map.idle;
}

function log(msg, type="") {
  const panel = document.getElementById("logPanel");
  const body = document.getElementById("logBody");
  panel.classList.add("visible");
  const time = new Date().toLocaleTimeString("pt-BR");
  const div = document.createElement("div");
  div.className = "log-line" + (type ? " log-"+type : "");
  div.textContent = "["+time+"] "+msg;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  logCount++;
  document.getElementById("logCount").textContent = logCount+" eventos";
}

function render() {
  const tbody = document.getElementById("queueBody");
  const empty = document.getElementById("queueEmpty");
  const table = document.getElementById("queueTable");
  document.getElementById("queueCount").textContent = contacts.length+" contato"+(contacts.length!==1?"s":"");
  document.getElementById("launchCount").textContent = contacts.length;
  document.getElementById("launchBtn").disabled = contacts.length===0||running;
  if (contacts.length===0) { empty.style.display="block"; table.style.display="none"; return; }
  empty.style.display="none"; table.style.display="table";
  tbody.innerHTML="";
  contacts.forEach(c => {
    const tr = document.createElement("tr");
    tr.id = "row-"+c.id;
    tr.innerHTML = '<td style="font-family:\'DM Mono\',monospace">'+c.phone+'</td><td><span class="project-badge '+badgeClass(c.project)+'">'+projectLabel(c.project)+'</span></td><td id="status-'+c.id+'">'+statusChip(c.status)+'</td><td id="msgs-'+c.id+'" style="color:var(--muted);font-size:0.72rem">'+c.msgCount+' msgs</td><td><button class="remove-btn" onclick="removeContact('+c.id+')" '+(running?"disabled":"")+'>✕</button></td>';
    tbody.appendChild(tr);
  });
}

function updateRow(c) {
  const s = document.getElementById("status-"+c.id);
  const m = document.getElementById("msgs-"+c.id);
  if (s) s.innerHTML = statusChip(c.status);
  if (m) m.textContent = c.msgCount+" msgs";
}

function addSingle() {
  const phone = cleanPhone(document.getElementById("singlePhone").value.trim());
  const proj = document.getElementById("singleProject").value;
  if (phone.length<8) return alert("Número inválido.");
  if (contacts.find(c=>c.phone===phone)) return alert("Número já está na fila.");
  contacts.push({id:nextId++,phone,project:proj,status:"idle",msgCount:0});
  document.getElementById("singlePhone").value="";
  render();
}

function importBulk() {
  const lines = document.getElementById("bulkText").value.split("\\n");
  const proj = document.getElementById("bulkProject").value;
  let added=0;
  lines.forEach(l => {
    const phone = cleanPhone(l.trim());
    if (phone.length<10||contacts.find(c=>c.phone===phone)) return;
    contacts.push({id:nextId++,phone,project:proj,status:"idle",msgCount:0});
    added++;
  });
  document.getElementById("bulkText").value="";
  log(added+" contato(s) importados ("+projectLabel(proj)+")","info");
  render();
}

function removeContact(id) { contacts=contacts.filter(c=>c.id!==id); render(); }

async function launchAll() {
  if (running||contacts.length===0) return;
  running=true; stopFlag=false;
  document.getElementById("launchBtn").style.display="none";
  document.getElementById("stopBtn").style.display="inline-block";
  document.getElementById("progressWrap").style.display="flex";
  const total=contacts.length; let done=0;
  log("Iniciando disparo para "+total+" contato(s)...","info");
  for (const c of contacts) {
    if (stopFlag) { log("Disparo interrompido.","warn"); break; }
    if (c.status!=="idle") { done++; continue; }
    c.status="sending"; updateRow(c);
    log("Iniciando com "+c.phone+" ("+projectLabel(c.project)+")...","info");
    try {
      const res = await fetch("/start", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({phone:c.phone, project:c.project})
      });
      const data = await res.json();
      if (data.ok) {
        c.status="active"; c.msgCount=1;
        log("✓ Enviado para "+c.phone,"ok");
      } else { throw new Error(data.error||"Erro desconhecido"); }
    } catch(e) {
      c.status="error";
      log("✗ Erro em "+c.phone+": "+e.message,"err");
    }
    updateRow(c); done++;
    document.getElementById("progressFill").style.width=Math.round((done/total)*100)+"%";
    if (done<total) await new Promise(r=>setTimeout(r,3000));
  }
  log("Concluído. "+contacts.filter(c=>c.status==="active").length+" enviados.","ok");
  running=false;
  document.getElementById("launchBtn").style.display="inline-block";
  document.getElementById("stopBtn").style.display="none";
  document.getElementById("launchBtn").disabled=false;
  render();
}

function stopAll() { stopFlag=true; log("Parando...","warn"); }
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`📡 Webhook: POST /webhook`);
  console.log(`🚀 Iniciar conversa: POST /start`);
  console.log(`📦 Disparar em lote: POST /start-batch`);
});
