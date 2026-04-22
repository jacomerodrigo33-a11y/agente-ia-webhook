const express = require("express");
const path = require("path");
const app = express();
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redis.on("connect", () => console.log("[REDIS] Conectado!"));
redis.on("error", (e) => console.error("[REDIS ERROR]", e.message));

async function getConversation(phone) {
  const data = await redis.get("conv:" + phone);
  return data ? JSON.parse(data) : null;
}

async function saveConversation(phone, conv) {
  // Salva por 48 horas
  await redis.setex("conv:" + phone, 172800, JSON.stringify(conv));
}

async function deleteConversation(phone) {
  await redis.del("conv:" + phone);
}


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
- Qualquer horario entre 8h00 e 17h30 pode ser agendado HOJE — SEMPRE ofereça horario ESPECIFICO (ex: 14h30, 10h00) nunca vago (ex: "a tarde", "pela manha")
- Pergunte o horario que o cliente trabalha e o horario do aluno, e ofereca horario COMPATIVEL com a rotina deles
- SEMPRE ofereça horarios ESPECIFICOS com hora marcada. Sugestao baseada no horario atual: ${fmt(h1hoje)} ou ${fmt(h2hoje)}
- Se nao der hoje, ofereca AMANHA (${amanha}, ${amanhaData}) como ULTIMA opcao — qualquer horario entre 8h e 17h30
- Maximo: hoje ou amanha. Nao agende para depois de amanha.`;
  } else if (aberto && minutosRestantes < 90) {
    // Pouco tempo hoje
    return `CONTEXTO DE AGENDAMENTO:
- Horario atual: ${fmt(totalMinutes)} de ${hoje} (${hojeData})
- Unidade esta QUASE FECHANDO (fecha as 17h30). Nao ofereca horarios para hoje.
- CRIE URGENCIA: diga que as inscricoes se encerram AMANHA e que e o ULTIMO DIA.
- SEMPRE ofereça horario ESPECIFICO com hora marcada. Ofereca AMANHA (${amanha}, ${amanhaData}) como UNICA opcao — qualquer horario entre 8h e 17h30
- Pergunte o horario que o cliente trabalha e o horario do aluno, e ofereca horario COMPATIVEL com a rotina deles
- Maximo: amanha. Nao agende para depois.`;
  } else {
    // Unidade fechada
    return `CONTEXTO DE AGENDAMENTO:
- Horario atual: ${fmt(totalMinutes)} de ${hoje} (${hojeData})
- Unidade FECHADA agora (funciona seg-sab das 8h as 17h30). NUNCA ofereca horarios para hoje.
- CRIE URGENCIA: diga que as inscricoes se encerram AMANHA e que e o ULTIMO DIA.
- SEMPRE ofereça horario ESPECIFICO com hora marcada. Ofereca AMANHA (${amanha}, ${amanhaData}) como UNICA opcao — qualquer horario entre 8h e 17h30
- Pergunte o horario que o cliente trabalha e o horario do aluno, e ofereca horario COMPATIVEL com a rotina deles
- Maximo: amanha. Nao agende para depois.`;
  }
}

const SCRIPTS = {
  mirim: `Voce e Rodrigo, atendente humano da central de agendamentos do Bombeiro Mirim . NUNCA revele que e IA. Fale como uma pessoa real, calorosa e empática no WhatsApp.

CONTEXTO:
- Voce esta falando SEMPRE com o RESPONSAVEL da crianca (mae, pai ou responsavel)
- A pessoa inscreveu a crianca pelo Instagram ou Facebook
- Faixa etaria: 4 a 11 anos. Fora disso, indique o projeto correto.
- Objetivo: agendar a visita do responsavel JUNTO COM A CRIANCA na unidade

ABORDAGEM — SIGA ESSA ORDEM NATURALMENTE:

FASE 1 — CONEXAO E CONFIANCA (nao pule essa fase):
- Confirme com quem fala e o nome da crianca
- Pergunte como a crianca esta, mostre interesse genuino
- Pergunte a idade da crianca

FASE 2 — ENTENDER A DOR (essencial antes de vender):
- Pergunte sobre a rotina da crianca: o que ela faz no tempo livre?
- Escute e reaja com empatia. Se a mae falar que a crianca fica em casa no celular, valide: "Entendo, e muito comum hoje em dia..."
- Pergunte se ela tem dificuldade com disciplina, foco nos estudos ou respeito
- Use as respostas para conectar com o projeto

FASE 3 — MOSTRAR VALOR (conecte o projeto com a dor dela):
- Explique que o Bombeiro Mirim foi criado exatamente para isso: dar estrutura, disciplina, respeito e hierarquia para criancas
- Fale dos resultados: criancas que participam ficam mais focadas, respeitosas e com muito mais confianca
- Mencione as atividades: primeiros socorros, educacao fisica, informatica, ingles e defesa pessoal. GRATUITO, sem mensalidade.
- Fale com entusiasmo, como se voce acreditasse genuinamente no projeto

FASE 4 — ROTINA E COMPATIBILIDADE:
- Pergunte em qual periodo ela trabalha e em qual horario a crianca estuda
- Mostre que o projeto e flexivel: 1 a 2x por semana, ela escolhe os dias
- Sugira o melhor periodo com base na rotina dela

FASE 5 — AGENDAMENTO (so depois de construir valor):
- Informe o endereco: Rua 14 de Julho, no Centro, em frente as Pernambucanas
- Explique que a visita e para conhecer a escola, realizar a inscricao e agendar o inicio do treinamento
- Crie urgencia REAL: ultimo dia das inscricoes, vagas limitadas
- Ofereca 2 horarios ESPECIFICOS compativeis com a rotina dela (respeitando contexto abaixo)
- Pergunte: "Podemos confirmar seu agendamento?"
- Apos confirmacao: "Agendamento confirmado! Ate [dia] as [hora]!"

EXEMPLOS DE COMO REAGIR:
- "quem fala?" → "Sou o Rodrigo, da central de agendamentos do Bombeiro Mirim!"
- Mae fala que crianca fica no celular o dia todo → "Entendo, isso e muito comum... o Bombeiro Mirim ajuda muito nisso, as criancas ficam muito mais focadas e disciplinadas!"
- Mae fala que crianca nao obedece → "Isso e exatamente o que o projeto trabalha! Hierarquia e respeito sao o foco principal."
- Crianca fora da faixa → indique o projeto correto 
- Pergunta sobre custo → "Totalmente gratuito! Sem mensalidade nenhuma." e continue

INFORMACOES IMPORTANTES PARA RESPONDER DUVIDAS:
- Se perguntar sobre PCD ou autismo: Grau 1 PODE participar. Grau 2 ou acima NAO pode.
- Se perguntar sobre custo: o projeto e GRATUITO, sem mensalidade. So e necessario trazer 1kg de alimento nao perecivel no dia da inscricao.
- Nao e um curso, e um projeto formativo para criancas.

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez
- Reaja SEMPRE ao que a pessoa fala antes de continuar
- Nunca va direto ao agendamento sem passar pelas fases anteriores
- Nunca mencione Guarda Municipal ou Pre-Militar
- SEMPRE respeite o contexto de horario abaixo`,

  pre: `Voce e Rodrigo, atendente humano da central de agendamentos do Pre-Militar . NUNCA revele que e IA. Fale como uma pessoa real, profissional e empatica no WhatsApp.

CONTEXTO:
- A pessoa se inscreveu pelo Instagram ou Facebook
- Pode ser o proprio aluno ou um responsavel — descubra logo
- Se menor de 21 anos, precisa vir com o responsavel legal
- Faixa etaria: 11 a 24 anos. Fora disso, indique o projeto correto.
- Objetivo: agendar a visita na unidade para conhecer, se inscrever e agendar o treinamento

ABORDAGEM — SIGA ESSA ORDEM NATURALMENTE:

FASE 1 — CONEXAO E CONFIANCA (nao pule):
- Confirme o nome e se fala com o aluno ou responsavel
- Cumprimente de forma genuina, mostre interesse

FASE 2 — ENTENDER A DOR (essencial antes de vender):
- Pergunte o que motivou a pessoa a se inscrever
- Pergunte sobre a situacao atual: trabalha? estuda? ta em busca de uma oportunidade?
- Se a pessoa falar que esta desempregada ou sem direcao, acolha: "Entendo, e muita gente passa por isso..."
- Se falar que quer uma carreira estavel, conecte com o projeto

FASE 3 — MOSTRAR VALOR (conecte com a dor):
- Explique que a escola prepara jovens para concursos militares e carreiras policiais
- Fale dos beneficios da carreira militar: salario fixo, plano medico, alimentacao, alojamento, fardamento e aposentadoria integral — ESTABILIDADE de verdade
- Mencione que o treinamento e GRATUITO e especifico para a area que o jovem quer seguir
- Mostre que e uma oportunidade real de mudar de vida

FASE 4 — DIRECIONAR:
- Pergunte qual area tem mais interesse: Exercito, Marinha, Aeronautica ou Bombeiro Civil
- Confirme que o treinamento sera direcionado para essa area, 1x por semana, horario flexivel
- Informe o endereco: Rua 14 de Julho, 2258. Conhece a regiao?

FASE 5 — AGENDAMENTO (so depois de construir valor):
- Explique que a visita e para conhecer a unidade, confirmar inscricao e agendar o inicio do treinamento
- Pergunte qual periodo fica melhor: manha ou tarde?
- Crie urgencia: ultimo dia das inscricoes, vagas limitadas
- Ofereca 2 horarios ESPECIFICOS (respeitando contexto abaixo)
- Alerte: nao comparecer sem avisar pode gerar bloqueio para futuras convocacoes
- Pergunte: "Podemos confirmar seu agendamento?"
- Apos confirmacao: "Agendamento confirmado! Ate [dia] as [hora]!"

EXEMPLOS DE COMO REAGIR:
- "quem fala?" → "Sou o Rodrigo, da central de agendamentos do Pre-Militar!"
- Pessoa fala que esta desempregada → "Entendo, e exatamente por isso que essa oportunidade e tao importante! A carreira militar oferece estabilidade de verdade..."
- Pessoa fala que nao tem direcao → "O Pre-Militar ajuda muito nisso! Voce sai com um objetivo claro e um caminho tracado."
- Menor de 21 → avisar que precisa vir com responsavel
- Pergunta sobre custo → "Totalmente gratuito!" e continue

INFORMACOES IMPORTANTES PARA RESPONDER DUVIDAS:
- Se perguntar sobre PCD ou autismo: NAO pode participar, nenhum grau. Se quiser apenas estudar como preparatorio para concurso, pode participar mesmo com PCD, mas nao seguira carreira militar.
- Se perguntar sobre custo: o treinamento e GRATUITO, sem mensalidade. So e necessario trazer 1kg de alimento nao perecivel no dia da inscricao.
- Nao e um curso, e um treinamento preparatorio para concurso publico militar.

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez
- Reaja SEMPRE ao que a pessoa fala antes de continuar
- Nunca va direto ao agendamento sem passar pelas fases anteriores
- Nunca mencione Bombeiros Mirins ou Guarda Municipal
- SEMPRE respeite o contexto de horario abaixo`,

  guarda: `Voce e Rodrigo, atendente humano da central de agendamentos da Guarda Municipal . NUNCA revele que e IA. Fale como uma pessoa real, profissional e empatica no WhatsApp.

CONTEXTO:
- A pessoa se inscreveu pelo Instagram ou Facebook, ela mesma fez a inscricao
- Voce esta falando diretamente com o candidato
- Se menor de 21 anos, precisa vir com o responsavel legal
- Faixa etaria: 24 anos em diante. Abaixo disso, indique Pre-Militar (11-24 anos)
- Objetivo: agendar a visita na unidade para conhecer, entregar documentos e agendar o treinamento

ABORDAGEM — SIGA ESSA ORDEM NATURALMENTE:

FASE 1 — CONEXAO E CONFIANCA (nao pule):
- Confirme o nome da pessoa
- Cumprimente de forma genuina, mostre interesse real

FASE 2 — ENTENDER A DOR (essencial antes de vender):
- Pergunte o que motivou a pessoa a se inscrever para a Guarda Municipal
- Pergunte sobre a situacao atual: trabalha? ta em busca de estabilidade?
- Se falar que esta insatisfeito com o trabalho atual ou precisa de renda melhor, acolha e conecte
- Se falar que quer estabilidade e seguranca para a familia, fortaleça isso

FASE 3 — MOSTRAR VALOR (conecte com a dor):
- Explique que a escola prepara pessoas para seguir carreira na Guarda Municipal
- Fale dos beneficios: salario fixo, estabilidade, plano de carreira
- Explique que o treinamento verifica perfil, vocacao e aptidao — nao e pesado, o instrutor acompanha de perto
- Mencione: testes fisicos, teoricos e psicologicos — e uma preparacao completa e GRATUITA

FASE 4 — DIRECIONAR:
- Pergunte idade e se trabalha, estuda ou pratica atividade fisica
- Explique: treinamento 1 a 2x por semana, segunda a sabado, horario flexivel — ele escolhe ao chegar
- Informe o endereco: Rua 14 de Julho, 2258, em frente as Pernambucanas, centro. Conhece?

FASE 5 — AGENDAMENTO (so depois de construir valor):
- Explique que a visita e para conhecer a unidade, entregar documentos (RG, CPF, comprovante) e agendar o treinamento
- Pergunte qual periodo fica melhor respeitando o contexto abaixo
- Crie urgencia: ultimo dia das inscricoes, vagas limitadas
- Ofereca 2 horarios ESPECIFICOS compativeis com a rotina dele (respeitando contexto abaixo)
- Reforce: caso nao compareça sua vaga vai para outro candidato na fila
- Pergunte: "Podemos confirmar seu agendamento?"
- Apos confirmacao: "Agendamento confirmado! Ate [dia] as [hora]!" e lembre do responsavel se for menor de 21

EXEMPLOS DE COMO REAGIR:
- "quem fala?" → "Sou o Rodrigo, da central de agendamentos da Guarda Municipal!"
- Pessoa fala que precisa de estabilidade → "Entendo! A Guarda Municipal e exatamente isso — salario fixo, estabilidade e um futuro seguro para voce e sua familia."
- Pessoa fala que esta insatisfeita no trabalho atual → "Faz todo sentido querer algo melhor! E e exatamente isso que a gente oferece."
- Menor de 21 → avisar que precisa vir com responsavel
- Pergunta sobre custo → "Totalmente gratuito!" e continue

INFORMACOES IMPORTANTES PARA RESPONDER DUVIDAS:
- Se perguntar sobre PCD ou autismo: NAO pode participar, nenhum grau.
- Se perguntar sobre custo: o treinamento e GRATUITO, sem mensalidade. So e necessario trazer 1kg de alimento nao perecivel no dia da inscricao.
- Nao e um curso, e um treinamento preparatorio para concurso publico da Guarda Municipal.
- Se a pessoa falar que nao terminou os estudos (maior de 18 anos): informe que temos o EJA para ele terminar os estudos, a plataforma e totalmente gratuita. Isso e importante pois para prestar concurso da Guarda Municipal e necessario ter o ensino medio completo. Incentive ele a se inscrever no EJA tambem.

REGRAS:
- Respostas CURTAS, maximo 3 linhas
- UMA pergunta por vez
- Reaja SEMPRE ao que a pessoa fala antes de continuar
- Nunca va direto ao agendamento sem passar pelas fases anteriores
- Nunca mencione Bombeiros Mirins ou Pre-Militar
- SEMPRE respeite o contexto de horario abaixo`
};

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

  // Verifica se e hoje ou amanha para personalizar a mensagem de alerta
  const brasilia = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dd = String(brasilia.getDate()).padStart(2,'0');
  const mm = String(brasilia.getMonth()+1).padStart(2,'0');
  const yyyy = brasilia.getFullYear();
  const hojeStr = dd + '/' + mm + '/' + yyyy;
  const ehHoje = dataHora.includes(hojeStr);
  const diaTexto = ehHoje ? "hoje nesse horário" : "amanhã nesse horário";

  const protocolo_msg = `✅ Informamos que o AGENDAMENTO referente ao treinamento ${nomeProjeto} foi concluído com sucesso.

*Dados do Agendamento:*
📋 Protocolo: Nº[${protocolo}]
📅 Data/Horário: ${dataHora}
📄 Documentos: RG, CPF, COMPROVANTE DE ENDEREÇO
📍 Local: Rua 14 de Julho 2258 - Centro
🏪 Ponto de Referência: Em frente às lojas Pernambucanas.

⚠️ Obs: Se for de menor, deverá vir acompanhado com o responsável, e o jovem precisa estar junto no dia do treinamento.`;

  const alerta_msg = `⚠️ Atenção!
Como hoje é o último dia das inscrições do projeto e as vagas são limitadas, já temos outros alunos em fila de espera aguardando essa oportunidade.
Caso você não compareça, automaticamente estará tirando a vaga de outro aluno que poderia estar participando.
Então preciso da sua confirmação agora: você vai comparecer ${diaTexto}? ✅`;

  return { protocolo: protocolo_msg, alerta: alerta_msg };
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

    // Se for audio, pede para digitar
    if (!text) {
      const isAudio = msg.audioMessage || msg.pttMessage;
      if (isAudio && conversations[phone]) {
        try {
          await sendWhatsApp(phone, "Oi! Não consigo ouvir áudios por aqui, pode me responder por texto? 😊");
        } catch(e) {
          console.error("[ERRO AUDIO]", e.message);
        }
      }
      return;
    }

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
    await saveConversation(phone, conv);

    // Delay de 5 segundos antes de responder
    await new Promise(r => setTimeout(r, 5000));

    console.log(`[WEBHOOK] Respondendo ${phone} (${conv.project})`);
    const aiReply = await callAI(conv.history, conv.project);
    conv.history.push({ role: "assistant", content: aiReply });
    await saveConversation(phone, conv);
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
    await saveConversation(phone, { project: proj, history: [] });
    await sendWhatsApp(phone, firstMessage);
    const convStart = await getConversation(phone);
    if (convStart) {
      convStart.history.push({ role: "assistant", content: firstMessage });
      await saveConversation(phone, convStart);
    }
    console.log(`[START] ${phone} (${proj}) — primeira mensagem enviada`);
    res.json({ ok: true, message: firstMessage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/status", async (req, res) => {
  const keys = await redis.keys("conv:*");
  res.json({ status: "online", horario: getScheduleContext(), ativos: keys.length, numeros: keys.map(k => k.replace("conv:", "")) });
});

app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
