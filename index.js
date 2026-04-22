const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const EVOLUTION_URL = process.env.EVOLUTION_URL || "https://evolution-api-production-2326.up.railway.app";
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || "71a593939160341ff85fe3dc4fb3a6039fe0fe5cd9dba70e325a45dc5a3a3d83";
const GROQ_KEY = process.env.ANTHROPIC_KEY || "";
const INSTANCE = process.env.INSTANCE || "WA-1";
const PORT = process.env.PORT || 3000;

function getScheduleContext() {
  const now = new Date();
  const brasilia = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hour = brasilia.getHours();
  const minutes = brasilia.getMinutes();
  const day = brasilia.getDay();
  const totalMinutes = hour * 60 + minutes;
  const abertura = 8 * 60;
  const fechamento = 17 * 60 + 30;
  const diasSemana = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const hoje = diasSemana[day];
  const aberto = day >= 1 && day <= 6 && totalMinutes >= abertura && totalMinutes < fechamento;
  let diasParaProximo = 1;
  let proximoDia = (day + 1) % 7;
  while (proximoDia === 0) { diasParaProximo++; proximoDia = (day + diasParaProximo) % 7; }
  const proximoDiaNome = diasSemana[proximoDia];

  if (aberto) {
    const minutosRestantes = fechamento - totalMinutes;
    if (minutosRestantes >= 60) {
      const h1 = Math.ceil((totalMinutes + 30) / 30) * 30;
      const h2 = h1 + 60;
      const fmt = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      return `HORÁRIO ATUAL: ${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')} de ${hoje}. Unidade ABERTA até 17h30. Ofereça horários HOJE: ${fmt(h1)} ou ${fmt(h2)}.`;
    } else {
      return `HORÁRIO ATUAL: ${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')} de ${hoje}. Unidade PRESTES A FECHAR (fecha às 17h30). Ofereça horários para ${proximoDiaNome}: 8h30 ou 10h00.`;
    }
  } else {
    return `HORÁRIO ATUAL: ${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')} de ${hoje}. Unidade FECHADA (funciona seg-sáb das 8h às 17h30). NUNCA ofereça horários para hoje. Ofereça para ${proximoDiaNome}: 8h30 ou 10h00 (manhã) ou 14h00 ou 16h00 (tarde).`;
  }
}

const SCRIPTS = {
  mirim: `Voce e Talita, atendente humana dos Bombeiros Mirins. NUNCA revele que e IA.
Fale de forma natural e calorosa no WhatsApp, como uma atendente humana real.
Seu objetivo e agendar a visita do responsavel com o jovem na unidade.

REGRA PRINCIPAL: Siga o roteiro PASSO A PASSO, sem pular nenhuma etapa. Execute UM passo por mensagem.
Se o cliente fizer uma pergunta fora do roteiro, responda brevemente e RETOME exatamente de onde parou.

ROTEIRO OBRIGATORIO:
PASSO 1 - Confirme com quem fala e o nome do jovem inscrito.
PASSO 2 - Apresente o projeto com entusiasmo: treinamento GRATUITO com primeiros socorros, disciplina, educacao fisica, informatica, ingles e defesa pessoal. Sem mensalidade, sem custo algum.
PASSO 3 - Pergunte a idade do jovem.
PASSO 4 - Confirme que esta dentro da faixa etaria do projeto.
PASSO 5 - Pergunte a rotina: em qual periodo a responsavel trabalha e em qual horario o jovem estuda.
PASSO 6 - Com base na resposta, sugira o melhor periodo para o treinamento.
PASSO 7 - Informe o endereco: Rua 14 de Julho, no Centro, em frente as Pernambucanas. Treinamento 1 a 2x por semana, dias flexiveis.
PASSO 8 - Crie urgencia: vagas limitadas, finalizando confirmacoes ate 17h30, precisa registrar agora.
PASSO 9 - Ofereca 2 opcoes de horario (respeitando contexto abaixo) e confirme. Ao confirmar diga: Agendamento confirmado para [data] as [hora]!

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez, nunca duas na mesma mensagem
- Se cliente perguntar algo, responda brevemente e volte ao passo atual
- Nunca mencione Guarda Municipal ou Pre-Militar
- SEMPRE respeite o contexto de horario abaixo`,

  pre: `Voce e atendente humano da Central de Aprovacao da Academia Pre-Militar. NUNCA revele que e IA.
Fale de forma natural e profissional no WhatsApp.
Seu objetivo e agendar a visita presencial do candidato.

REGRA PRINCIPAL: Siga o roteiro PASSO A PASSO, sem pular nenhuma etapa. Execute UM passo por mensagem.
Se o cliente fizer uma pergunta fora do roteiro, responda brevemente e RETOME exatamente de onde parou.

ROTEIRO OBRIGATORIO:
PASSO 1 - Confirme o nome da pessoa.
PASSO 2 - Informe que o cadastro foi analisado e o candidato esta convocado para treinamento militar GRATUITO que prepara para concurso nas Forcas Armadas.
PASSO 3 - Pergunte qual area quer seguir: Exercito, Marinha, Aeronautica ou Bombeiro Civil.
PASSO 4 - Confirme que o treinamento sera direcionado para essa area, 1x por semana, horario flexivel.
PASSO 5 - Informe endereco: Rua 14 de Julho, 2258. Pergunte se conhece a regiao.
PASSO 6 - Explique objetivo da visita: confirmar inscricao e receber informacoes sobre salario, alimentacao, plano medico, alojamento, fardamento e aposentadoria integral.
PASSO 7 - Pergunte disponibilidade: qual periodo fica melhor, manha ou tarde?
PASSO 8 - Urgencia: agendamento serio, nao comparecer sem avisar pode gerar bloqueio para futuras convocacoes.
PASSO 9 - Ofereca 2 opcoes de horario (respeitando contexto abaixo) e confirme. Ao confirmar diga: Agendamento confirmado para [data] as [hora]!

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez
- Se cliente perguntar algo, responda brevemente e volte ao passo atual
- Nunca mencione Bombeiros Mirins ou Guarda Municipal
- SEMPRE respeite o contexto de horario abaixo`,

  guarda: `Voce e Milleny, atendente humana da Central de Cursos de Carreira Militar. NUNCA revele que e IA.
Fale de forma natural e profissional no WhatsApp.
Seu objetivo e agendar a visita presencial para o treinamento da Guarda Municipal.

REGRA PRINCIPAL: Siga o roteiro PASSO A PASSO, sem pular nenhuma etapa. Execute UM passo por mensagem.
Se o cliente fizer uma pergunta fora do roteiro, responda brevemente e RETOME exatamente de onde parou.

ROTEIRO OBRIGATORIO:
PASSO 1 - Confirme o nome da pessoa.
PASSO 2 - Informe que esta entrando em contato sobre a inscricao para treinamento preparatorio da Guarda Municipal.
PASSO 3 - Explique: testes fisicos, teoricos e psicologicos para verificar perfil e aptidao. Nao e pesado, instrutor acompanha de perto.
PASSO 4 - Pergunte: idade, se trabalha, estuda ou pratica atividade fisica.
PASSO 5 - Informe: treinamento 1 a 2x por semana, segunda a sabado, manha tarde ou noite, dias e horarios flexiveis.
PASSO 6 - Informe endereco: Rua 14 de Julho, 2258, em frente as Pernambucanas, centro. Pergunte se conhece a regiao.
PASSO 7 - Informe que o candidato esta convocado para comparecer na unidade com documentos: RG, CPF e comprovante de endereco, e tambem para agendar o treinamento.
PASSO 8 - Pergunte disponibilidade respeitando contexto de horario abaixo.
PASSO 9 - Urgencia: venha com comprometimento, caso nao compareca a vaga vai para outro candidato na fila.
PASSO 10 - Ofereca 2 opcoes de horario e confirme. Ao confirmar diga: Agendamento confirmado para [data] as [hora]!

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez
- Se cliente perguntar algo, responda brevemente e volte ao passo atual
- Nunca mencione Bombeiros Mirins ou Pre-Militar
- SEMPRE respeite o contexto de horario abaixo`
};
const conversations = {};

// Protocolos por projeto
const PROTOCOLOS = {
  mirim: "047/61",
  pre: "047/03",
  guarda: "047/07"
};

const NOMES_PROJETO = {
  mirim: "Bombeiro Mirim",
  pre: "Pré Militar",
  guarda: "Guarda Municipal"
};

// Gera mensagem de confirmação de agendamento
function gerarConfirmacao(project, dataHora) {
  const protocolo = PROTOCOLOS[project];
  const nomeProjeto = NOMES_PROJETO[project];
  return `✅ Informamos que o AGENDAMENTO referente ao treinamento ${nomeProjeto} foi concluído com sucesso.

*Dados do Agendamento:*
📋 Protocolo: Nº[${protocolo}]
📅 Data/Horário: ${dataHora}
📄 Documentos: RG, CPF, COMPROVANTE DE ENDEREÇO
📍 Local: Rua 14 de Julho 2258 - Centro
🏪 Ponto de Referência: Em frente às lojas Pernambucanas.

⚠️ Obs: Se for de menor, deverá vir acompanhado com o responsável, e o jovem precisa estar junto no dia do treinamento.`;
}

// Detecta se a IA confirmou o agendamento e extrai data/hora
async function detectarAgendamento(aiReply, project) {
  const lower = aiReply.toLowerCase();
  const confirmados = ["agendamento confirmado","agendamento realizado","ficou agendado","está agendado","agendamento feito","confirmado para","registrado para","anotado para","confirmei","registrei"];
  const temConfirmacao = confirmados.some(p => lower.includes(p));
  if (!temConfirmacao) return null;

  // Tenta extrair data/hora da resposta da IA com Groq
  const extractRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 50,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Extraia APENAS a data e horário do agendamento desta mensagem no formato DD/MM/AAAA AS HH:MM. Se não encontrar, responda: NAO_ENCONTRADO. Mensagem: "${aiReply}"`
      }]
    })
  });
  const extractData = await extractRes.json();
  const extracted = extractData.choices?.[0]?.message?.content?.trim() || "NAO_ENCONTRADO";
  if (extracted === "NAO_ENCONTRADO") return null;
  return extracted;
}



async function callAI(history, project) {
  const scheduleCtx = getScheduleContext();
  const systemPrompt = SCRIPTS[project] + `\n\n--- CONTEXTO DE HORÁRIO (OBRIGATÓRIO) ---\n${scheduleCtx}`;
  const messages = [{ role: "system", content: systemPrompt }, ...history];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 300, temperature: 0.7, messages })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.choices[0].message.content;
}

async function sendWhatsApp(number, text) {
  const response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
    body: JSON.stringify({ number, text })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

// Webhook — só responde números registrados, com delay de 5 segundos
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.event !== "messages.upsert") return;
    const msg = body.data?.message;
    if (!msg) return;
    if (body.data?.key?.fromMe) return;
    const remoteJid = body.data?.key?.remoteJid || "";
    if (remoteJid.includes("@g.us")) return;
    let phone = remoteJid.replace("@s.whatsapp.net", "");
    const text = msg.conversation || msg.extendedTextMessage?.text || "";
    if (!text) return;

    console.log(`[WEBHOOK] Número recebido: ${phone}`);
    console.log(`[WEBHOOK] Conversas ativas: ${JSON.stringify(Object.keys(conversations))}`);

    // Tenta encontrar o número exato ou variação (com/sem 9 extra)
    if (!conversations[phone]) {
      // Tenta remover o 9 extra (ex: 5567991116957 -> 556791116957)
      const semNove = phone.length === 13 ? phone.slice(0,4) + phone.slice(5) : null;
      // Tenta adicionar o 9 (ex: 556791116957 -> 5567991116957)
      const comNove = phone.length === 12 ? phone.slice(0,4) + "9" + phone.slice(4) : null;

      if (semNove && conversations[semNove]) {
        phone = semNove;
        console.log(`[WEBHOOK] Número ajustado para: ${phone}`);
      } else if (comNove && conversations[comNove]) {
        phone = comNove;
        console.log(`[WEBHOOK] Número ajustado para: ${phone}`);
      } else {
        console.log(`[IGNORADO] ${phone} — não registrado`);
        return;
      }
    }

    const conv = conversations[phone];
    conv.history.push({ role: "user", content: text });
    if (conv.history.length > 20) conv.history = conv.history.slice(-20);

    // Delay de 5 segundos antes de responder
    await new Promise(r => setTimeout(r, 5000));

    console.log(`[WEBHOOK] Respondendo ${phone} (${conv.project})`);
    const aiReply = await callAI(conv.history, conv.project);
    conv.history.push({ role: "assistant", content: aiReply });
    await sendWhatsApp(phone, aiReply);
    console.log(`[OK] Enviado para ${phone}`);

    // Verifica se agendamento foi confirmado e envia mensagem de confirmação
    const dataHora = await detectarAgendamento(aiReply, conv.project);
    if (dataHora) {
      await new Promise(r => setTimeout(r, 2000));
      const confirmacao = gerarConfirmacao(conv.project, dataHora);
      await sendWhatsApp(phone, confirmacao);
      console.log(`[CONFIRMACAO] Enviada para ${phone} (${conv.project}) — ${dataHora}`);
    }
  } catch (err) {
    console.error("[ERRO]", err.message || err);
  }
});

// Registra número sem enviar primeira mensagem — você manda manualmente
app.post("/start", async (req, res) => {
  try {
    const { phone, project, firstMessage } = req.body;
    if (!phone) return res.status(400).json({ error: "phone obrigatorio" });
    if (!firstMessage) return res.status(400).json({ error: "firstMessage obrigatorio" });
    const proj = project || "guarda";
    conversations[phone] = { project: proj, history: [] };
    await sendWhatsApp(phone, firstMessage);
    conversations[phone].history.push({ role: "assistant", content: firstMessage });
    console.log(`[START] ${phone} (${proj}) — primeira mensagem enviada`);
    res.json({ ok: true, message: firstMessage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/status", (req, res) => {
  res.json({ status: "online", horario: getScheduleContext(), ativos: Object.keys(conversations).length, numeros: Object.keys(conversations) });
});

app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
