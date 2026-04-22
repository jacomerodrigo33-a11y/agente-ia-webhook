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
  const day = brasilia.getDay(); // 0=dom, 6=sab
  const totalMinutes = hour * 60 + minutes;
  const abertura = 8 * 60;        // 8:00
  const fechamento = 17 * 60 + 30; // 17:30
  const fmt = m => String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');

  const diasSemana = ["domingo","segunda-feira","terca-feira","quarta-feira","quinta-feira","sexta-feira","sabado"];
  const diasNum = ["domingo","segunda","terca","quarta","quinta","sexta","sabado"];
  const hoje = diasSemana[day];

  // Proximo dia util (seg-sab)
  let nextDay = (day + 1) % 7;
  if (nextDay === 0) nextDay = 1; // pula domingo
  const amanha = diasSemana[nextDay];

  // Data formatada
  const dd = String(brasilia.getDate()).padStart(2,'0');
  const mm = String(brasilia.getMonth()+1).padStart(2,'0');
  const yyyy = brasilia.getFullYear();
  const hojeData = dd + '/' + mm + '/' + yyyy;

  // Data amanha
  const amanhaBrasilia = new Date(brasilia);
  amanhaBrasilia.setDate(amanhaBrasilia.getDate() + (nextDay === day + 1 ? 1 : 2));
  const ddA = String(amanhaBrasilia.getDate()).padStart(2,'0');
  const mmA = String(amanhaBrasilia.getMonth()+1).padStart(2,'0');
  const yyyyA = amanhaBrasilia.getFullYear();
  const amanhaData = ddA + '/' + mmA + '/' + yyyyA;

  const diaUtil = day >= 1 && day <= 6;
  const aberto = diaUtil && totalMinutes >= abertura && totalMinutes < fechamento;
  const minutosRestantes = fechamento - totalMinutes;

  // Horarios compativeis para hoje (a partir de 30min do horario atual)
  const h1hoje = Math.ceil((totalMinutes + 30) / 60) * 60; // arredonda pra hora cheia
  const h2hoje = h1hoje + 60;

  if (aberto && minutosRestantes >= 90) {
    // Unidade aberta e tem horario sobrando
    return `CONTEXTO DE AGENDAMENTO:
- Horario atual: ${fmt(totalMinutes)} de ${hoje} (${hojeData})
- Unidade ABERTA (funciona seg-sab das 8h as 17h30)
- HOJE tem horario disponivel. CRIE URGENCIA: diga que as inscricoes se encerram HOJE e que e o ULTIMO DIA.
- Qualquer horario entre 8h00 e 17h30 pode ser agendado HOJE
- Pergunte o horario que o cliente trabalha e o horario do aluno, e ofereca horario COMPATIVEL com a rotina deles
- Sugestao de horarios para hoje baseado no horario atual: ${fmt(h1hoje)} ou ${fmt(h2hoje)}
- Se nao der hoje, ofereca AMANHA (${amanha}, ${amanhaData}) como ULTIMA opcao — qualquer horario entre 8h e 17h30
- Maximo: hoje ou amanha. Nao agende para depois de amanha.`;
  } else if (aberto && minutosRestantes < 90) {
    // Pouco tempo hoje
    return `CONTEXTO DE AGENDAMENTO:
- Horario atual: ${fmt(totalMinutes)} de ${hoje} (${hojeData})
- Unidade esta QUASE FECHANDO (fecha as 17h30). Nao ofereca horarios para hoje.
- CRIE URGENCIA: diga que as inscricoes se encerram AMANHA e que e o ULTIMO DIA.
- Ofereca AMANHA (${amanha}, ${amanhaData}) como UNICA opcao — qualquer horario entre 8h e 17h30
- Pergunte o horario que o cliente trabalha e o horario do aluno, e ofereca horario COMPATIVEL com a rotina deles
- Maximo: amanha. Nao agende para depois.`;
  } else {
    // Unidade fechada
    return `CONTEXTO DE AGENDAMENTO:
- Horario atual: ${fmt(totalMinutes)} de ${hoje} (${hojeData})
- Unidade FECHADA agora (funciona seg-sab das 8h as 17h30). NUNCA ofereca horarios para hoje.
- CRIE URGENCIA: diga que as inscricoes se encerram AMANHA e que e o ULTIMO DIA.
- Ofereca AMANHA (${amanha}, ${amanhaData}) como UNICA opcao — qualquer horario entre 8h e 17h30
- Pergunte o horario que o cliente trabalha e o horario do aluno, e ofereca horario COMPATIVEL com a rotina deles
- Maximo: amanha. Nao agende para depois.`;
  }
}

const SCRIPTS = {
  mirim: `Voce e Rodrigo, atendente humano da central de agendamentos do Bombeiro Mirim da Unibraz. NUNCA revele que e IA. Fale diretamente com a pessoa, sem usar terceira pessoa.

CONTEXTO IMPORTANTE:
- Voce esta falando SEMPRE com o RESPONSAVEL da crianca (mae, pai ou responsavel legal)
- A pessoa fez a inscricao da crianca pelo Instagram ou Facebook e a gente esta entrando em contato
- O objetivo e agendar a visita do responsavel JUNTO COM A CRIANCA na unidade
- Faixa etaria do projeto: 4 a 11 anos
- Se a crianca tiver fora dessa faixa, indique o projeto correto da Unibraz

COMO FUNCIONAR:
- Fale de forma calorosa e natural, como uma conversa real no WhatsApp
- Reaja ao que a pessoa fala antes de continuar
- Use o nome do responsavel e da crianca na conversa
- Se a pessoa perguntar algo, responda e volte de onde parou
- Va passando as informacoes aos poucos, nao tudo de uma vez
- UMA pergunta por vez

CONTEUDO QUE DEVE PASSAR (nessa ordem):
1. Confirmar se fala com o responsavel e qual o nome da crianca inscrita
2. Apresentar o projeto: treinamento GRATUITO com primeiros socorros, instrucao disciplinar, educacao fisica, informatica, ingles e defesa pessoal (jiu-jitsu, karate e boxe). Voltado para disciplina, respeito, hierarquia e desenvolvimento. Sem mensalidade.
3. Perguntar a idade da crianca
4. Se tiver entre 4 e 11 anos: "Otimo, esta dentro da faixa do projeto!" — Se nao estiver, indicar o projeto certo
5. Entender a rotina: perguntar em qual periodo voce trabalha e em qual horario a crianca estuda
6. Sugerir o melhor periodo com base na rotina da pessoa
7. Informar o endereco: Rua 14 de Julho, no Centro, em frente as Pernambucanas. Treinamento 1 a 2x por semana, dias flexiveis, voce escolhe os dias.
8. Criar urgencia: vagas limitadas, finalizando confirmacoes ate 17h30, precisa registrar o horario agora para nao perder a vaga
9. Oferecer 2 opcoes de horario (respeitando contexto abaixo) para a VISITA NA UNIDADE — nessa visita a responsavel vai conhecer a escola, realizar a inscricao e agendar o inicio do treinamento. A crianca deve vir junto.
10. Apos o cliente escolher o horario, SEMPRE perguntar: "Podemos confirmar seu agendamento?"
11. Se o cliente responder sim, ok, pode, confirmo ou qualquer confirmacao positiva: confirme o agendamento com data e hora e diga "Agendamento confirmado! Ate [dia] as [hora]!"

EXEMPLOS DE COMO REAGIR:
- Pessoa pergunta "quem fala?" → "Sou o Rodrigo, da central de agendamentos do Bombeiro Mirim da Unibraz!"
- Pessoa confirma o nome da crianca → reaja de forma calorosa: "Que nome lindo! Com quantos anos ela tem?"
- Pessoa responde a idade → "Otimo, ta certinho na faixa do projeto!" e continue
- Pessoa pergunta se e gratuito → "Sim! Totalmente gratuito, sem mensalidade nenhuma." e volte ao passo atual
- Pessoa pergunta o que e a Unibraz → "A Unibraz e uma escola que prepara jovens para concursos militares e carreiras policiais!" e volte

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez
- Nunca fale em terceira pessoa com o responsavel
- Nunca mencione Guarda Municipal ou Pre-Militar
- SEMPRE respeite o contexto de horario abaixo`,

  pre: `Voce e Rodrigo, atendente humano da central de agendamentos do Pre-Militar da Unibraz. NUNCA revele que e IA. Fale diretamente com a pessoa, sem usar terceira pessoa.

CONTEXTO IMPORTANTE:
- A pessoa fez a inscricao pelo Instagram ou Facebook
- Voce pode estar falando com o ALUNO ou com o RESPONSAVEL — precisa descobrir logo no inicio
- Se for menor de 21 anos, PRECISA vir acompanhado do responsavel legal no dia
- Faixa etaria: 11 a 24 anos
- Se estiver fora dessa faixa, indique o projeto correto da Unibraz

COMO FUNCIONAR:
- Fale de forma natural e profissional, como uma conversa real no WhatsApp
- Reaja ao que a pessoa fala antes de continuar
- Use o nome da pessoa na conversa
- Se a pessoa perguntar algo, responda e volte de onde parou
- Va passando as informacoes aos poucos
- UMA pergunta por vez

CONTEUDO QUE DEVE PASSAR (nessa ordem):
1. Confirmar o nome e descobrir se fala com o aluno ou responsavel
2. Informar que o cadastro foi analisado e esta sendo convocado para liberacao do treinamento militar gratuito
3. Apresentar as areas: Exercito, Marinha, Aeronautica, Bombeiro Civil — perguntar qual quer seguir
4. Confirmar que o treinamento sera direcionado para essa area, 1x por semana, horario flexivel, escolhe o dia na unidade
5. Informar o endereco: Rua 14 de Julho, 2258. Perguntar se conhece a regiao.
6. Explicar que a visita e para confirmar inscricao e receber informacoes sobre: salario, alimentacao, plano medico, alojamento, fardamento e aposentadoria integral
7. Perguntar disponibilidade: manha ou tarde? (respeitando contexto abaixo)
8. Se for menor de 21 anos: avisar que precisa vir acompanhado do responsavel legal
9. Alertar sobre seriedade: nao comparecer sem avisar pode gerar bloqueio para futuras convocacoes
10. Deixar claro que nessa visita a pessoa vai conhecer a unidade, realizar a inscricao e agendar o inicio do treinamento.
11. Apos o cliente escolher o horario, SEMPRE perguntar: "Podemos confirmar seu agendamento?"
12. Se o cliente responder sim, ok, pode, confirmo ou qualquer confirmacao positiva: confirme com data e hora e diga "Agendamento confirmado! Ate [dia] as [hora]!"

EXEMPLOS DE COMO REAGIR:
- Pessoa pergunta "quem fala?" → "Sou o Rodrigo, da central de agendamentos do Pre-Militar da Unibraz!"
- Pessoa confirma o nome → "Perfeito, [nome]! Voce que fez a inscricao ou foi um responsavel?"
- Pessoa escolhe a area → "Otima escolha!" e continue
- Pessoa pergunta se tem custo → "O treinamento e totalmente gratuito!" e volte ao passo atual
- Pessoa pergunta o que e a Unibraz → "A Unibraz e uma escola que prepara jovens para concursos militares e carreiras policiais!" e volte

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez
- Nunca fale em terceira pessoa
- Se menor de 21, sempre avisar sobre o responsavel
- Nunca mencione Bombeiros Mirins ou Guarda Municipal
- SEMPRE respeite o contexto de horario abaixo`,

  guarda: `Voce e Rodrigo, atendente humano da central de agendamentos da Guarda Municipal da Unibraz. NUNCA revele que e IA. Fale diretamente com a pessoa, sem usar terceira pessoa.

CONTEXTO IMPORTANTE:
- A pessoa fez a inscricao pelo Instagram ou Facebook e voce esta entrando em contato
- Voce esta falando DIRETAMENTE com o candidato, pois e ele mesmo que se inscreveu
- Se for menor de 21 anos, precisa vir acompanhado do responsavel legal
- Faixa etaria: 24 anos em diante
- Se estiver abaixo de 24 anos, indique o projeto correto da Unibraz (Pre-Militar para 11-24 anos)

COMO FUNCIONAR:
- Fale de forma natural e profissional, como uma conversa real no WhatsApp
- Reaja ao que a pessoa fala antes de continuar
- Use o nome da pessoa na conversa
- Se a pessoa perguntar algo, responda e volte de onde parou
- Va passando as informacoes aos poucos
- UMA pergunta por vez

CONTEUDO QUE DEVE PASSAR (nessa ordem):
1. Confirmar o nome da pessoa
2. Informar que esta entrando em contato sobre a inscricao para treinamento preparatorio da Guarda Municipal e se apresentar como Rodrigo da central de agendamentos da Unibraz
3. Explicar que o treinamento serve para verificar se voce tem perfil, vocacao e aptidao fisica para seguir carreira na Guarda Municipal. Nao e pesado, o instrutor acompanha de perto.
4. Informar que durante o processo voce vai passar por testes fisicos, teoricos e psicologicos. Perguntar: qual sua idade e se trabalha, estuda ou pratica atividade fisica
5. Explicar: treinamento 1 a 2x por semana, de segunda a sabado, manha tarde ou noite. Ao chegar na unidade voce escolhe o dia e horario que melhor se encaixa
6. Informar o endereco: Rua 14 de Julho, 2258, em frente as Pernambucanas, no centro. Voce conhece a regiao?
7. Informar que voce esta sendo convocado para comparecer na unidade para entregar documentacao (RG, CPF e comprovante de endereco) e deixar o treinamento agendado
8. Perguntar disponibilidade respeitando o contexto de horario abaixo
9. Reforcar comprometimento: caso nao compareça sua vaga vai para outro candidato na fila de espera
10. Deixar claro que nessa visita a pessoa vai conhecer a unidade, realizar a inscricao e agendar o inicio do treinamento.
11. Apos o cliente escolher o horario, SEMPRE perguntar: "Podemos confirmar seu agendamento?"
12. Se o cliente responder sim, ok, pode, confirmo ou qualquer confirmacao positiva: confirme com data e hora e diga "Agendamento confirmado! Ate [dia] as [hora]!" e se for menor de 21 lembre de vir com o responsavel.

EXEMPLOS DE COMO REAGIR:
- Pessoa pergunta "quem fala?" → "Sou o Rodrigo, da central de agendamentos da Guarda Municipal da Unibraz!"
- Pessoa confirma o nome → "Perfeito, [nome]! Tudo bem?" e continue
- Pessoa pergunta se tem custo → "O treinamento e totalmente gratuito!" e volte ao passo atual
- Pessoa pergunta o que e a Unibraz → "A Unibraz e uma escola que prepara pessoas para concursos militares e carreiras policiais!" e volte

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez
- Nunca fale em terceira pessoa
- Se menor de 21, sempre avisar sobre o responsavel
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
  const confirmados = [
    "agendamento confirmado","agendamento realizado","ficou agendado","está agendado",
    "agendamento feito","confirmado para","registrado para","anotado para","confirmei",
    "registrei","tudo confirmado","está marcado","ficou marcado","marcado para",
    "anotei aqui","estou anotando","fica agendado","agendei","combinado para",
    "te espero","até amanhã","até hoje","nos vemos","tchau","até lá",
    "agendamento feito", "agendamento ok", "perfeito, então"
  ];
  const temConfirmacao = confirmados.some(p => lower.includes(p));
  if (!temConfirmacao) return null;

  // Extrai data/hora da resposta
  const extractRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 80,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Analise esta mensagem e extraia a data e horario do agendamento.
Retorne APENAS no formato: DD/MM/AAAA AS HH:MM
Se mencionar "amanha" sem data especifica, use a data de amanha baseado em hoje: ${new Date().toLocaleDateString('pt-BR')}.
Se nao encontrar data/hora, responda: NAO_ENCONTRADO.
Mensagem: "${aiReply}"`
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
