require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const flash = require('express-flash');
const crypto = require('crypto');
const fetch = require('node-fetch');
const cors = require('cors');

// Verificar variáveis de ambiente essenciais
if (!process.env.MONGODB_URI) {
  console.error('Erro: Variável MONGODB_URI não definida no ficheiro .env');
  process.exit(1);
}

// Gerar chave secreta se não existir
if (!process.env.SESSION_SECRET) {
  const chaveTemporaria = crypto.randomBytes(32).toString('hex');
  process.env.SESSION_SECRET = chaveTemporaria;
}

const aplicacao = express();

// Configuração de CORS
const origensPermitidas = [
  'https://trabalho2-mashup-apis-itsandre03.vercel.app'
];

// Permitir localhost em ambiente de desenvolvimento
if (process.env.NODE_ENV !== 'producao') {
  origensPermitidas.push('http://localhost:5500', 'http://127.0.0.1:5500');
}

aplicacao.use(cors({
  origin: function (origem, callback) {
    if (!origem || origensPermitidas.includes(origem)) {
      callback(null, true);
    } else {
      callback(new Error('Origem não permitida pela política de CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const PORTA = process.env.PORT || 3000;

// Configuração de sessão
aplicacao.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    httpOnly: true,
    secure: process.env.NODE_ENV === 'producao',
    sameSite: process.env.NODE_ENV === 'producao' ? 'none' : 'lax',
  },
  proxy: true
}));

// Inicialização do Passport
aplicacao.use(passport.initialize());
aplicacao.use(passport.session());
aplicacao.use(flash());
aplicacao.use(express.json());

// Ligação com a base de dados MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Ligação estabelecida com MongoDB Atlas'))
.catch(erro => {
  console.error('Falha na ligação com MongoDB:', erro.message);
  process.exit(1);
});

// Modelo de Utilizador
const EsquemaUtilizador = new mongoose.Schema({
  nomeUtilizador: { 
    type: String, 
    unique: true,
    required: true,
    trim: true,
    minlength: 3
  },
  palavraPasse: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  }
});

// Encriptação da palavra-passe antes de armazenar
EsquemaUtilizador.pre('save', async function(seguinte) {
  if (!this.isModified('palavraPasse')) return seguinte();
  try {
    const sal = await bcrypt.genSalt(10);
    this.palavraPasse = await bcrypt.hash(this.palavraPasse, sal);
    seguinte();
  } catch (erro) {
    seguinte(erro);
  }
});

const Utilizador = mongoose.model('Utilizador', EsquemaUtilizador);

// Modelo de Histórico de Pesquisas
const EsquemaHistorico = new mongoose.Schema({
  idUtilizador: { type: mongoose.Schema.Types.ObjectId, ref: 'Utilizador', required: true },
  pokemon: { type: String },
  digimon: { type: String },
  dataHora: { type: Date, default: Date.now }
});
const Historico = mongoose.model('Historico', EsquemaHistorico);

// Estratégia de Autenticação Local
passport.use(new LocalStrategy(
  async (nomeUtilizador, palavraPasse, concluido) => {
    try {
      const utilizador = await Utilizador.findOne({ nomeUtilizador }).select('+palavraPasse');
      if (!utilizador) return concluido(null, false, { message: 'Credenciais inválidas' });
      
      const valido = await bcrypt.compare(palavraPasse, utilizador.palavraPasse);
      if (!valido) return concluido(null, false, { message: 'Credenciais inválidas' });
      
      return concluido(null, utilizador);
    } catch (erro) {
      return concluido(erro);
    }
  }
));

passport.serializeUser((utilizador, concluido) => concluido(null, utilizador.id));
passport.deserializeUser(async (id, concluido) => {
  try {
    const utilizador = await Utilizador.findById(id);
    concluido(null, utilizador);
  } catch (erro) {
    concluido(erro);
  }
});

// Middleware de autenticação
function verificarAutenticacao(requisicao, resposta, seguinte) {
  if (requisicao.isAuthenticated()) return seguinte();
  resposta.status(401).json({ sucesso: false, mensagem: 'Acesso não autorizado' });
}

// URLs das APIs externas
const URL_POKEAPI = 'https://pokeapi.co/api/v2/';
const URL_DIGIMON_API = 'https://digi-api.com/api/v1/';

// Rota principal da API
aplicacao.get('/', (requisicao, resposta) => {
  resposta.json({
    mensagem: "Bem-vindo à API de Mashup Pokémon/Digimon",
    endpoints: {
      autenticacao: [
        "POST /login - Autenticar utilizador",
        "POST /registar - Registar novo utilizador",
        "GET /terminar-sessao - Terminar sessão",
        "GET /verificar-sessao - Verificar estado da sessão"
      ],
      api: [
        "GET /api/pesquisar/pokemon?nome=:nome - Pesquisar Pokémon",
        "GET /api/pesquisar/digimon?nome=:nome - Pesquisar Digimon",
        "GET /api/historico - Obter histórico de pesquisas",
        "POST /api/atualizar-palavra-passe - Atualizar palavra-passe"
      ]
    }
  });
});

// Rota de Autenticação
aplicacao.post('/login', (requisicao, resposta, seguinte) => {
  passport.authenticate('local', (erro, utilizador, informacao) => {
    if (erro) {
      return resposta.status(500).json({ sucesso: false, mensagem: 'Erro no servidor' });
    }
    if (!utilizador) {
      return resposta.status(401).json({ sucesso: false, mensagem: informacao.mensagem || 'Credenciais inválidas' });
    }
    requisicao.logIn(utilizador, (erro) => {
      if (erro) {
        return resposta.status(500).json({ sucesso: false, mensagem: 'Erro no processo de autenticação' });
      }
      return resposta.json({ 
        sucesso: true, 
        utilizador: { nomeUtilizador: utilizador.nomeUtilizador } 
      });
    });
  })(requisicao, resposta, seguinte);
});

// Rota de Verificação de Sessão
aplicacao.get('/verificar-sessao', (requisicao, resposta) => {
  if (requisicao.isAuthenticated()) {
    return resposta.json({ autenticado: true, utilizador: { nomeUtilizador: requisicao.user.nomeUtilizador } });
  }
  resposta.json({ autenticado: false });
});

// Rota de Registo
aplicacao.post('/registar', async (requisicao, resposta) => {
  try {
    const { nomeUtilizador, palavraPasse } = requisicao.body;
    
    // Validação de entrada
    if (!nomeUtilizador || !palavraPasse || palavraPasse.length < 6) {
      return resposta.status(400).json({ 
        sucesso: false, 
        mensagem: 'Nome de utilizador e palavra-passe (mínimo 6 caracteres) são obrigatórios' 
      });
    }
    
    const utilizadorExistente = await Utilizador.findOne({ nomeUtilizador });
    if (utilizadorExistente) {
      return resposta.status(400).json({ 
        sucesso: false, 
        mensagem: 'Nome de utilizador já registado' 
      });
    }
    
    const novoUtilizador = new Utilizador({ nomeUtilizador, palavraPasse });
    await novoUtilizador.save();
    
    resposta.json({ 
      sucesso: true, 
      mensagem: 'Registo concluído com êxito. Pode agora autenticar-se' 
    });
  } catch (erro) {
    console.error('Erro no processo de registo:', erro);
    resposta.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro durante o registo de utilizador' 
    });
  }
});

// Rota de Terminar Sessão
aplicacao.get('/terminar-sessao', (requisicao, resposta) => {
  requisicao.logout(function(erro) {
    if (erro) {
      return resposta.status(500).json({ sucesso: false, mensagem: 'Erro ao terminar sessão' });
    }
    // Destruir completamente a sessão
    requisicao.session.destroy((erro) => {
      if (erro) {
        return resposta.status(500).json({ sucesso: false, mensagem: 'Erro ao terminar sessão' });
      }
      resposta.clearCookie('connect.sid');
      resposta.json({ sucesso: true, mensagem: 'Sessão terminada com sucesso' });
    });
  });
});

// Rota para dados do utilizador
aplicacao.get('/api/utilizador', verificarAutenticacao, (requisicao, resposta) => {
  resposta.json({ nomeUtilizador: requisicao.user.nomeUtilizador });
});

// Rota para pesquisa de Pokémon
aplicacao.get('/api/pesquisar/pokemon', verificarAutenticacao, async (requisicao, resposta) => {
  try {
    const { nome } = requisicao.query;
    const respostaAPI = await fetch(`${URL_POKEAPI}pokemon/${nome.toLowerCase()}`);
    
    if (!respostaAPI.ok) {
      return resposta.status(404).json({ 
        sucesso: false, 
        erro: 'Pokémon não encontrado' 
      });
    }
    
    const dados = await respostaAPI.json();
    
    // Armazenar no histórico
    const entradaHistorico = new Historico({
      idUtilizador: requisicao.user._id,
      pokemon: nome,
      dataHora: new Date()
    });
    await entradaHistorico.save();
    
    resposta.json(dados);
  } catch (erro) {
    console.error('Erro na pesquisa de Pokémon:', erro);
    resposta.status(500).json({ 
      sucesso: false, 
      erro: 'Erro durante a pesquisa de Pokémon' 
    });
  }
});

// Rota para pesquisa de Digimon
aplicacao.get('/api/pesquisar/digimon', verificarAutenticacao, async (requisicao, resposta) => {
  try {
    const { nome } = requisicao.query;
    const respostaAPI = await fetch(`${URL_DIGIMON_API}digimon?nome=${encodeURIComponent(nome)}`);
    
    if (!respostaAPI.ok) {
      return resposta.status(404).json({ 
        sucesso: false, 
        erro: 'Digimon não encontrado' 
      });
    }
    
    const { conteudo } = await respostaAPI.json();
    
    if (!conteudo || conteudo.length === 0) {
      return resposta.status(404).json({ 
        sucesso: false, 
        erro: 'Digimon não encontrado' 
      });
    }
    
    const respostaDetalhes = await fetch(`${URL_DIGIMON_API}digimon/${conteudo[0].id}`);
    if (!respostaDetalhes.ok) {
      return resposta.status(404).json({ 
        sucesso: false, 
        erro: 'Detalhes do Digimon não encontrados' 
      });
    }
    
    const dados = await respostaDetalhes.json();
    
    // Armazenar no histórico
    const entradaHistorico = new Historico({
      idUtilizador: requisicao.user._id,
      digimon: nome,
      dataHora: new Date()
    });
    await entradaHistorico.save();
    
    resposta.json(dados);
  } catch (erro) {
    console.error('Erro na pesquisa de Digimon:', erro);
    resposta.status(500).json({ 
      sucesso: false, 
      erro: 'Erro durante a pesquisa de Digimon' 
    });
  }
});

// Rota para histórico de pesquisas
aplicacao.get('/api/historico', verificarAutenticacao, async (requisicao, resposta) => {
  try {
    const historico = await Historico.find({ idUtilizador: requisicao.user._id })
      .sort({ dataHora: -1 })
      .limit(10);
      
    resposta.json(historico);
  } catch (erro) {
    console.error('Erro ao recuperar histórico:', erro);
    resposta.status(500).json({ 
      sucesso: false, 
      erro: 'Erro ao obter histórico de pesquisas' 
    });
  }
});

// Rota para atualizar palavra-passe
aplicacao.post('/api/atualizar-palavra-passe', verificarAutenticacao, async (requisicao, resposta) => {
  try {
    const { novaPalavraPasse } = requisicao.body;
    const utilizador = await Utilizador.findById(requisicao.user._id);
    
    if (!utilizador) {
      return resposta.status(404).json({ 
        sucesso: false, 
        mensagem: 'Utilizador não encontrado' 
      });
    }
    
    // Atualizar palavra-passe
    utilizador.palavraPasse = novaPalavraPasse;
    await utilizador.save();
    
    resposta.json({ 
      sucesso: true, 
      mensagem: 'Palavra-passe atualizada com sucesso' 
    });
  } catch (erro) {
    console.error('Erro na atualização de palavra-passe:', erro);
    resposta.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro durante a atualização da palavra-passe' 
    });
  }
});

// Rota para endpoint não encontrado
aplicacao.use((requisicao, resposta) => {
  resposta.status(404).json({ 
    sucesso: false, 
    mensagem: "Endpoint não encontrado" 
  });
});

// Middleware de tratamento de erros
aplicacao.use((erro, requisicao, resposta, seguinte) => {
  console.error('Erro:', erro.stack);
  resposta.status(500).json({ 
    sucesso: false, 
    mensagem: 'Ocorreu um erro no servidor' 
  });
});

// Iniciar o servidor
aplicacao.listen(PORTA, () => {
  console.log(`Servidor API em execução na porta ${PORTA}`);
  console.log(`Modo de segurança: ${process.env.NODE_ENV === 'producao' ? 'HTTPS (sameSite=none)' : 'HTTP (sameSite=lax)'}`);
});
