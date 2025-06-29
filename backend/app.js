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

// Verificar variáveis essenciais
if (!process.env.MONGODB_URI) {
  console.error('Erro: MONGODB_URI não definida no .env');
  process.exit(1);
}

// Gerar chave secreta se não existir
if (!process.env.SESSION_SECRET) {
  const tempSecret = crypto.randomBytes(32).toString('hex');
  process.env.SESSION_SECRET = tempSecret;
}

const app = express();

// Configuração do CORS para permitir múltiplas origens
const allowedOrigins = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://trabalho2-mashup-apis-itsandre03.vercel.app',
    'https://trabalho2-mashup-apis-itsandre03-git-main-itsandres-projects.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permitir requisições sem origem (como mobile apps ou curl)
        if (!origin) return callback(null, true);
        
        // Permitir todas as origens na lista
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } 
        // Permitir subdomínios do Vercel
        else if (/\.vercel\.app$/.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Não permitido pela política de CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware para pré-voo CORS
app.options('*', cors());

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração de sessão
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
    proxy: true
}));

// Passport e Flash
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Ligação com MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Ligação estabelecida com MongoDB Atlas'))
.catch(err => {
  console.error('Falha na ligação com MongoDB:', err.message);
  process.exit(1);
});

// Modelo de Utilizador
const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true,
    required: true,
    trim: true,
    minlength: 3
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  }
});

// Hash da palavra-passe antes de guardar
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

const User = mongoose.model('User', UserSchema);

// Modelo de Histórico de Pesquisas
const SearchHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pokemon: { type: String },
  digimon: { type: String },
  timestamp: { type: Date, default: Date.now }
});
const SearchHistory = mongoose.model('SearchHistory', SearchHistorySchema);

// Estratégia Local do Passport
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username }).select('+password');
      if (!user) return done(null, false, { message: 'Credenciais inválidas' });
      
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return done(null, false, { message: 'Credenciais inválidas' });
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Middleware de autenticação
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ success: false, message: 'Não autenticado' });
}

// URLs das APIs externas
const POKEAPI_URL = 'https://pokeapi.co/api/v2/';
const DIGIMON_API_URL = 'https://digi-api.com/api/v1/';

// Rota raiz da API
app.get('/', (req, res) => {
  res.json({
    message: "Bem-vindo à API do Mashup Pokémon/Digimon",
    endpoints: {
      auth: [
        "POST /login - Autenticar utilizador",
        "POST /register - Registar novo utilizador",
        "GET /logout - Terminar sessão",
        "GET /check-session - Verificar sessão"
      ],
      api: [
        "GET /api/search/pokemon?name=:name - Pesquisar Pokémon",
        "GET /api/search/digimon?name=:name - Pesquisar Digimon",
        "GET /api/history - Obter histórico de pesquisas",
        "POST /api/update-password - Atualizar palavra-passe"
      ]
    }
  });
});

// Rota de Autenticação (JSON)
app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
    if (!user) {
      return res.status(401).json({ success: false, message: info.message || 'Credenciais inválidas' });
    }
    req.logIn(user, (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Erro na autenticação' });
      }
      return res.json({ 
        success: true, 
        user: { username: user.username } 
      });
    });
  })(req, res, next);
});

// Rota de Verificação de Sessão
app.get('/check-session', (req, res) => {
  if (req.isAuthenticated()) {
    return res.json({ authenticated: true, user: { username: req.user.username } });
  }
  res.json({ authenticated: false });
});

// Rota de Registo (JSON)
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validação básica
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Utilizador e palavra-passe (mínimo 6 caracteres) são obrigatórios' 
      });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Utilizador já registado' 
      });
    }
    
    const newUser = new User({ username, password });
    await newUser.save();
    
    res.json({ 
      success: true, 
      message: 'Registo concluído com sucesso! Pode autenticar-se' 
    });
  } catch (err) {
    console.error('Erro no registo:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao registar utilizador' 
    });
  }
});

// Rota de Terminar Sessão (JSON)
app.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Erro ao terminar sessão' });
    }
    // Destruir a sessão completamente
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Erro ao terminar sessão' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Sessão terminada' });
    });
  });
});

// Rota para dados do utilizador
app.get('/api/user', ensureAuthenticated, (req, res) => {
  res.json({ username: req.user.username });
});

// Rota para pesquisa de Pokémon
app.get('/api/search/pokemon', ensureAuthenticated, async (req, res) => {
  try {
    const { name } = req.query;
    const response = await fetch(`${POKEAPI_URL}pokemon/${name.toLowerCase()}`);
    
    if (!response.ok) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pokémon não encontrado' 
      });
    }
    
    const data = await response.json();
    
    // Guardar no histórico
    const history = new SearchHistory({
      userId: req.user._id,
      pokemon: name,
      timestamp: new Date()
    });
    await history.save();
    
    res.json(data);
  } catch (error) {
    console.error('Erro ao pesquisar Pokémon:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao pesquisar Pokémon' 
    });
  }
});

// Rota para pesquisa de Digimon
app.get('/api/search/digimon', ensureAuthenticated, async (req, res) => {
  try {
    const { name } = req.query;
    const response = await fetch(`${DIGIMON_API_URL}digimon?name=${encodeURIComponent(name)}`);
    
    if (!response.ok) {
      return res.status(404).json({ 
        success: false, 
        error: 'Digimon não encontrado' 
      });
    }
    
    const { content } = await response.json();
    
    if (!content || content.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Digimon não encontrado' 
      });
    }
    
    const digimonResponse = await fetch(`${DIGIMON_API_URL}digimon/${content[0].id}`);
    if (!digimonResponse.ok) {
      return res.status(404).json({ 
        success: false, 
        error: 'Detalhes do Digimon não encontrados' 
      });
    }
    
    const data = await digimonResponse.json();
    
    // Guardar no histórico
    const history = new SearchHistory({
      userId: req.user._id,
      digimon: name,
      timestamp: new Date()
    });
    await history.save();
    
    res.json(data);
  } catch (error) {
    console.error('Erro ao pesquisar Digimon:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao pesquisar Digimon' 
    });
  }
});

// Rota para histórico de pesquisas
app.get('/api/history', ensureAuthenticated, async (req, res) => {
  try {
    const history = await SearchHistory.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(10);
      
    res.json(history);
  } catch (error) {
    console.error('Erro ao pesquisar histórico:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao pesquisar histórico' 
    });
  }
});

// Rota para atualizar palavra-passe
app.post('/api/update-password', ensureAuthenticated, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilizador não encontrado' 
      });
    }
    
    // Atualizar palavra-passe
    user.password = newPassword;
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Palavra-passe atualizada com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar palavra-passe:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao atualizar palavra-passe' 
    });
  }
});

// Rota para 404 (Endpoint não encontrado)
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: "Endpoint não encontrado" 
  });
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Ocorreu um erro interno no servidor' 
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor API em execução na porta ${PORT}`);
  console.log(`Modo de segurança: ${process.env.NODE_ENV === 'production' ? 'HTTPS (sameSite=none)' : 'HTTP (sameSite=lax)'}`);
});
