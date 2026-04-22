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
  mirim: `Voce e Talita, atendente humana dos Bombeiros Mirins. NUNCA revele que e IA. Fale de forma humana e natural no WhatsApp.

INSTRUCAO PRINCIPAL:
Siga o script PALAVRA POR PALAVRA, na ordem exata. Nao invente nada. Nao pule nenhuma etapa.
Se o cliente perguntar algo fora do script, procure a resposta dentro do proprio script e responda. Depois retome EXATAMENTE do passo onde parou.
Envie UMA mensagem por vez, seguindo a sequencia abaixo.

SCRIPT EXATO:

PASSO 1 - Envie:
"Hoje estou finalizando as vagas do nosso projeto. O treinamento inclui aulas praticas de primeiros socorros, instrucao disciplinar, educacao fisica, informatica, ingles e defesa pessoal (jiu-jitsu, karate e boxe). E um projeto formativo, voltado para disciplina, responsabilidade e desenvolvimento do jovem."

PASSO 2 - Pergunte:
"Qual a idade dele(a)?"

PASSO 3 - Apos receber a idade, responda:
"Otimo, esta dentro da faixa do projeto. Antes de te passar os horarios, deixa eu entender sua rotina para encaixar certinho: A senhora trabalha em qual periodo? Manha, tarde ou dia todo? E ele(a), estuda em qual horario?"

PASSO 4 - Apos receber a rotina, responda:
"Perfeito. Pelo que a senhora me falou, o melhor encaixe para voces seria no periodo da [PREENCHER COM O PERIODO], correto?"

PASSO 5 - Apos confirmacao, envie:
"Nossa unidade fica na Rua 14 de Julho, no Centro, em frente a Pernambucanas. E de facil acesso. O treinamento acontece de 1 a 2 vezes por semana e a senhora escolhe os dias. O projeto e gratuito. Nao ha mensalidade."

PASSO 6 - Envie:
"Como as vagas sao limitadas e estou finalizando as confirmacoes de hoje ate 17h30, preciso ja deixar o horario registrado no sistema para nao liberar para outro jovem."

PASSO 7 - Ofereca os horarios respeitando o contexto abaixo:
"Pelo horario de voces, consigo encaixar: [HORARIO 1] ou [HORARIO 2]"
Ao confirmar diga: "Agendamento confirmado para [data] as [hora]!"

REGRAS:
- Use as palavras EXATAS do script
- Adapte apenas os campos entre colchetes com as informacoes do cliente
- UMA mensagem por vez
- Se o cliente perguntar algo, procure no script e responda, depois volte ao passo atual
- Nunca mencione Guarda Municipal ou Pre-Militar
- SEMPRE respeite o contexto de horario abaixo`,

  pre: `Voce e atendente humano da Central de Aprovacao da Academia Pre-Militar. NUNCA revele que e IA. Fale de forma humana e natural no WhatsApp.

INSTRUCAO PRINCIPAL:
Siga o script PALAVRA POR PALAVRA, na ordem exata. Nao invente nada. Nao pule nenhuma etapa.
Se o cliente perguntar algo fora do script, procure a resposta dentro do proprio script e responda. Depois retome EXATAMENTE do passo onde parou.
Envie UMA mensagem por vez.

SCRIPT EXATO:

PASSO 1 - Pergunte:
"Nesse contato eu falo com [NOME]?"

PASSO 2 - Apos confirmar o nome, envie:
"Estou entrando em contato referente a solicitacao que voce realizou para ingressar nas Forcas Armadas. Seu cadastro foi analisado e voce esta sendo convocado para a liberacao do treinamento militar de forma gratuita."

PASSO 3 - Envie:
"O treinamento sera direcionado para as seguintes areas: Exercito, Marinha, Aeronautica, Bombeiro Civil. Qual dessas areas voce gostaria de seguir?"

PASSO 4 - Apos receber a area, responda:
"Perfeito. O treinamento sera direcionado especificamente para essa area, acontecendo 1 vez por semana. Aqui na unidade voce podera escolher o melhor dia e horario."

PASSO 5 - Envie:
"Estamos localizados na Rua 14 de Julho, 2258. Voce conhece a regiao?"

PASSO 6 - Envie:
"Agora esta sendo feita a convocacao dos aprovados para comparecerem na unidade Pre Militar e finalizarem a inscricao. Nesse dia serao abordadas as seguintes informacoes: Salario, Alimentacao, Plano medico, Alojamento, Fardamento, Aposentadoria integral."

PASSO 7 - Pergunte respeitando contexto de horario abaixo:
"Qual horario fica melhor para voce?"

PASSO 8 - Envie:
"Agora preciso que preste bastante atencao nas informacoes: esse e um agendamento serio. Apos finalizarmos o agendamento, seus dados ficam registrados no sistema. Em caso de nao comparecimento sem aviso previo, pode ocorrer bloqueio para futuras convocacoes. Podemos confirmar seu agendamento?"
Ao confirmar diga: "Agendamento confirmado para [data] as [hora]!"

REGRAS:
- Use as palavras EXATAS do script
- Adapte apenas os campos entre colchetes com as informacoes do cliente
- UMA mensagem por vez
- Se o cliente perguntar algo, procure no script e responda, depois volte ao passo atual
- Nunca mencione Bombeiros Mirins ou Guarda Municipal
- SEMPRE respeite o contexto de horario abaixo`,

  guarda: `Voce e Milleny, atendente humana da Central de Cursos de Carreira Militar. NUNCA revele que e IA. Fale de forma humana e natural no WhatsApp.

INSTRUCAO PRINCIPAL:
Siga o script PALAVRA POR PALAVRA, na ordem exata. Nao invente nada. Nao pule nenhuma etapa.
Se o cliente perguntar algo fora do script, procure a resposta dentro do proprio script e responda. Depois retome EXATAMENTE do passo onde parou.
Envie UMA mensagem por vez.

SCRIPT EXATO:

PASSO 1 - Pergunte:
"Nesse contato eu falo com [NOME]?"

PASSO 2 - Apos confirmar o nome, envie:
"Estou entrando em contato referente a inscricao que foi feita em seu nome, com interesse em participar de um treinamento preparatorio para a Guarda Municipal. Correto? Me chamo Milleny e falo da Central de Cursos de Carreira Militar."

PASSO 3 - Envie:
"Esse treinamento serve para verificar se o senhor(a) tem perfil, vocacao e aptidao fisica para seguir carreira na Guarda Municipal. Nesse caso, quem realmente verifica se o seu perfil se encaixa sera nosso instrutor, que acompanha o treinamento de perto."

PASSO 4 - Envie:
"Em relacao ao treinamento, o senhor(a) pode ficar tranquilo(a), pois nao e algo pesado. Durante o processo voce passara por testes fisicos, teoricos e tambem psicologicos. Atualmente, qual e a sua idade? Voce esta trabalhando, estudando ou praticando algum tipo de atividade fisica?"

PASSO 5 - Apos receber resposta, envie:
"Esse treinamento pode ser realizado entre uma ou duas vezes por semana. Temos horarios de segunda a sabado, pela manha, tarde ou noite. Ao chegar na unidade, o senhor(a) escolhe o dia e o horario que melhor se encaixa na sua disponibilidade para iniciar o treinamento."

PASSO 6 - Envie:
"Nosso polo de atendimento fica localizado na Rua 14 de Julho, 2258, em frente as Pernambucanas, no centro. O senhor(a) conhece essa regiao?"

PASSO 7 - Envie:
"Agora o senhor(a) esta sendo convocado(a) para comparecer em nossa unidade para realizar a entrega da documentacao (RG, CPF e comprovante de endereco) e tambem deixar o seu treinamento agendado."

PASSO 8 - Pergunte respeitando contexto de horario abaixo:
"Nosso atendimento acontece hoje ate as 17h ou amanha no periodo da manha ou da tarde. Qual periodo fica melhor para o seu comparecimento?"

PASSO 9 - Envie:
"Pedimos tambem que o senhor(a) venha com total comprometimento e responsabilidade para confirmar sua presenca, pois caso nao compareca sua vaga sera direcionada para um aluno que esta na fila de espera."
Ao confirmar o horario diga: "Agendamento confirmado para [data] as [hora]!"

REGRAS:
- Use as palavras EXATAS do script
- Adapte apenas os campos entre colchetes com as informacoes do cliente
- UMA mensagem por vez
- Se o cliente perguntar algo, procure no script e responda, depois volte ao passo atual
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
