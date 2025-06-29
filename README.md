# Mashup Pokémon/Digimon

Aplicação web que permite pesquisar, comparar e guardar histórico de criaturas das séries **Pokémon** e **Digimon**, recorrendo a APIs públicas e autenticação de utilizadores com persistência em base de dados.

## Elementos do Grupo

- André Falcão nº 31660
- Sofia Martins nº 31802

## Tecnologias e APIs Utilizadas

- **Frontend:** HTML, CSS, JavaScript (ES6+)
- **Backend:** Node.js com Express
- **Autenticação:** Passport.js com estratégia local
- **Base de Dados:** MongoDB Atlas (via mongoose)
- **APIs Externas:**
  - [PokeAPI](https://pokeapi.co/)
  - [Digimon API](https://digi-api.com/)

## Instruções de Instalação e Configuração

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/username/repositorio.git
   cd repositorio
   ```

2. **Instalar as dependências:**
   ```bash
   npm install
   ```

3. **Criar ficheiro `.env` na raiz do projecto com o seguinte conteúdo:**
   ```
   MONGODB_URI=mongodb+srv://<utilizador>:<palavra_passe>@<cluster>.mongodb.net/<base_de_dados>?retryWrites=true&w=majority
   SESSION_SECRET=<chave_secreta_aleatória>
   NODE_ENV=development
   ```

   - A variável `SESSION_SECRET` pode ser omitida, pois será gerada automaticamente se não existir.
   - Substituir os valores entre `< >` pelos dados reais da conta MongoDB Atlas.

## Executar Localmente

```bash
npm start
```

A aplicação ficará disponível em: [http://localhost:3000](http://localhost:3000)

> Nota: O frontend consome a API backend através de `fetch` e deverá correr num ambiente separado ou ser servido por um serviço externo como o Vercel.

## Link de Deployment

A aplicação encontra-se disponível em:

- **Frontend:** https://trabalho2-mashup-apis-itsandre03-git-main-itsandres-projects.vercel.app
- **Backend:** https://trabalho2-mashup-apis-itsandre03.onrender.com

---

## Funcionalidades Principais

- Registo e autenticação de utilizadores
- Pesquisa de Pokémon e Digimon com visualização de detalhes
- Comparação entre criaturas
- Histórico pessoal de pesquisas
- Atualização da palavra-passe
- Integração com múltiplas APIs públicas
- Sessões protegidas com cookies seguros

---

## Considerações de Segurança

- As palavras-passe são encriptadas com **bcryptjs**
- Sessões são mantidas via **express-session** com cookies configurados para produção
- **CORS** configurado apenas para origens autorizadas

---

## Licença

Este projecto foi desenvolvido para fins académicos. Qualquer reutilização deve citar os autores.
