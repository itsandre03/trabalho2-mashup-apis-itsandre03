require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const flash = require('express-flash');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const cors = require('cors');

// Verificar variáveis essenciais
if (!process.env.MONGODB_URI) {
  console.error('❌ Erro: MONGODB_URI não definida no .env');
  process.exit(1);
}

// Gerar chave secreta se não existir
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  AVISO: SESSION_SECRET não definida. A gerar chave temporária...');
  const tempSecret = crypto.randomBytes(32).toString('hex');
  process.env.SESSION_SECRET = tempSecret;
}

const app = express();
// Configuração do CORS para permitir múltiplas origens
const allowedOrigins = [
    'https://trabalho2-mashup-apis-itsandre03-git-main-itsandres-projects.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permite requisições sem origem (como aplicações móveis ou pedidos curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Não permitido pelo CORS'));
        }
    },
    credentials: true
}));
const PORT = process.env.PORT || 3000;

// Middleware para servir ficheiros estáticos
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configuração de sessão
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS em produção
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // Necessário para cross-site
  }
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
.then(() => console.log('✅ Ligação estabelecida com MongoDB Atlas'))
.catch(err => {
  console.error('❌ Falha na ligação com MongoDB:', err.message);
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
        console.error('Erro ao destruir sessão:', err);
        return res.status(500).json({ success: false, message: 'Erro ao terminar sessão' });
      }
      res.clearCookie('connect.sid'); // Nome padrão do cookie de sessão
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

// Rota para servir páginas HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('Erro:', err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Ocorreu um erro!' 
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor em execução na porta ${PORT}`);
  console.log(`🔒 Modo de segurança: ${process.env.NODE_ENV === 'production' ? 'HTTPS (sameSite=none)' : 'HTTP (sameSite=lax)'}`);
});
