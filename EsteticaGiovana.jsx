import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, where, getDocs, serverTimestamp } from 'firebase/firestore'; // Adicionado 'where' e 'getDocs'

// Main App Component
const App = () => {
  const [currentPage, setCurrentPage] = useState('home'); // State to manage current "tab"
  const [agendamentos, setAgendamentos] = useState([]); // State to store appointments
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize Firebase and set up auth listener
  useEffect(() => {
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

      if (Object.keys(firebaseConfig).length === 0) {
        throw new Error("Firebase config not provided. Please ensure __firebase_config is set.");
      }

      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // User is signed in
          setUserId(user.uid);
          setIsAuthReady(true);
          setLoading(false);
        } else {
          // No user is signed in, sign in anonymously or with custom token
          try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (authError) {
            console.error("Erro ao fazer login no Firebase:", authError);
            setError("Erro ao autenticar. Por favor, tente novamente.");
            setLoading(false);
          }
        }
      });

      // Clean up the subscription
      return () => unsubscribe();
    } catch (e) {
      console.error("Erro na inicialização do Firebase:", e);
      setError(`Erro na inicialização: ${e.message}`);
      setLoading(false);
    }
  }, []);

  // Fetch appointments when auth is ready and db/userId are available
  useEffect(() => {
    if (db && userId && isAuthReady) {
      // Query para buscar agendamentos do usuário logado
      const q = query(collection(db, `artifacts/${__app_id}/users/${userId}/agendamentos`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const ags = [];
        snapshot.forEach((doc) => {
          ags.push({ id: doc.id, ...doc.data() });
        });
        // Sort appointments by timestamp if available, otherwise by date/time string
        ags.sort((a, b) => {
          if (a.timestamp && b.timestamp) {
            return a.timestamp.toDate() - b.timestamp.toDate();
          }
          // Fallback to string comparison if timestamp is not present (less reliable)
          const dateA = `${a.data} ${a.hora}`;
          const dateB = `${b.data} ${b.hora}`;
          return dateA.localeCompare(dateB);
        });
        setAgendamentos(ags);
      }, (err) => {
        console.error("Erro ao buscar agendamentos:", err);
        setError("Erro ao carregar agendamentos.");
      });

      return () => unsubscribe();
    }
  }, [db, userId, isAuthReady]);

  // Componente para a página de Agendar Horário
  const AgendarHorario = () => {
    const [nomeCliente, setNomeCliente] = useState('');
    const [servico, setServico] = useState('');
    const [data, setData] = useState('');
    const [hora, setHora] = useState('');
    const [message, setMessage] = useState('');

    const handleAgendar = async () => {
      setMessage(''); // Clear previous messages
      if (!nomeCliente || !servico || !data || !hora) {
        setMessage('Por favor, preencha todos os campos.');
        return;
      }

      if (!db || !userId) {
        setMessage('Erro: Banco de dados não disponível ou usuário não autenticado.');
        return;
      }

      try {
        // 1. Verificar se o horário já está ocupado
        const agendamentosRef = collection(db, `artifacts/${__app_id}/users/${userId}/agendamentos`);
        const q = query(
          agendamentosRef,
          where("data", "==", data),
          where("hora", "==", hora)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          setMessage('Este horário já está preenchido. Por favor, escolha outro.');
          return;
        }

        // 2. Se não estiver ocupado, adicionar o novo agendamento
        await addDoc(agendamentosRef, {
          cliente: nomeCliente,
          servico: servico,
          data: data,
          hora: hora,
          timestamp: serverTimestamp() // Add a timestamp for ordering
        });
        setMessage('Agendamento realizado com sucesso!');
        setNomeCliente('');
        setServico('');
        setData('');
        setHora('');
      } catch (e) {
        console.error("Erro ao adicionar agendamento: ", e);
        setMessage('Erro ao agendar. Por favor, tente novamente.');
      }
    };

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Agendar Horário</h2>
        <div className="mb-4">
          <label htmlFor="nomeCliente" className="block text-gray-700 text-sm font-semibold mb-2">Nome do Cliente:</label>
          <input
            type="text"
            id="nomeCliente"
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500" // Cor alterada
            value={nomeCliente}
            onChange={(e) => setNomeCliente(e.target.value)}
            placeholder="Seu nome"
          />
        </div>
        <div className="mb-4">
          <label htmlFor="servico" className="block text-gray-700 text-sm font-semibold mb-2">Serviço Desejado:</label>
          <input
            type="text"
            id="servico"
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500" // Cor alterada
            value={servico}
            onChange={(e) => setServico(e.target.value)}
            placeholder="Ex: Micropigmentação de Sobrancelhas"
          />
        </div>
        <div className="mb-4">
          <label htmlFor="data" className="block text-gray-700 text-sm font-semibold mb-2">Data (DD/MM/AAAA):</label>
          <input
            type="text"
            id="data"
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500" // Cor alterada
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="Ex: 01/07/2025"
          />
        </div>
        <div className="mb-6">
          <label htmlFor="hora" className="block text-gray-700 text-sm font-semibold mb-2">Hora (HH:MM):</label>
          <input
            type="text"
            id="hora"
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500" // Cor alterada
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            placeholder="Ex: 14:30"
          />
        </div>
        <button
          onClick={handleAgendar}
          className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full transition duration-300 ease-in-out transform hover:scale-105" // Cores alteradas
        >
          Confirmar Agendamento
        </button>
        {message && <p className="text-center mt-4 text-sm text-gray-600">{message}</p>}

        <h3 className="text-xl font-bold text-gray-800 mt-8 mb-4 text-center">Seus Agendamentos</h3>
        {agendamentos.length === 0 ? (
          <p className="text-center text-gray-600">Nenhum agendamento cadastrado ainda.</p>
        ) : (
          <ul className="space-y-3">
            {agendamentos.map((ag) => (
              <li key={ag.id} className="bg-pink-50 p-4 rounded-lg shadow-sm border border-pink-200"> {/* Cores alteradas */}
                <p className="text-gray-800 font-semibold">{ag.cliente}</p>
                <p className="text-gray-700 text-sm">Serviço: {ag.servico}</p>
                <p className="text-700 text-sm">Data: {ag.data} às {ag.hora}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  // Componente para a página de Trabalhos
  const Trabalhos = () => {
    return (
      <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md mx-auto text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Nossos Trabalhos</h2>
        <p className="text-gray-700 text-lg">
          Em breve, uma galeria incrível com nossos melhores trabalhos!
          Prepare-se para se inspirar com transformações e resultados que realçam a beleza de cada cliente.
        </p>
        <p className="text-gray-600 text-sm mt-4">
          Fique de olho para as atualizações!
        </p>
        {/* Placeholder for future image gallery */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-gray-100 rounded-lg h-32 flex items-center justify-center text-gray-400 text-sm">
            
          </div>
          <div className="bg-gray-100 rounded-lg h-32 flex items-center justify-center text-gray-400 text-sm">
            
          </div>
          <div className="bg-gray-100 rounded-lg h-32 flex items-center justify-center text-gray-400 text-sm">
            
          </div>
          <div className="bg-gray-100 rounded-lg h-32 flex items-center justify-center text-gray-400 text-sm">
            
          </div>
        </div>
      </div>
    );
  };

  // Componente para a página Sobre Nós
  const SobreNos = () => {
    return (
      <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md mx-auto text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Sobre Nós</h2>
        <p className="text-gray-700 text-lg mb-4">
          - Giovana Ramos - Beautify
        </p>
        <p className="text-gray-800 font-semibold text-xl mb-2">Giovana Ramos</p>
        <p className="text-gray-700 text-md mb-4">
          25 anos - Profissional especializada em realçar a beleza do seu olhar através de técnicas avançadas em sobrancelhas.
        </p>
        <p className="text-gray-600 text-md">
          Meu compromisso é oferecer um atendimento personalizado e resultados que superem suas expectativas,
          sempre com as últimas tendências e o máximo de cuidado. Venha transformar seu olhar!
        </p>
      </div>
    );
  };

  // Renderização condicional das "abas"
  const renderPage = () => {
    if (loading) {
      return <div className="text-center text-gray-700 text-lg">Carregando aplicativo...</div>;
    }
    if (error) {
      return <div className="text-center text-red-600 text-lg">Erro: {error}</div>;
    }

    switch (currentPage) {
      case 'agendar':
        return <AgendarHorario />;
      case 'trabalhos':
        return <Trabalhos />;
      case 'sobre':
        return <SobreNos />;
      default:
        return (
          <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md mx-auto text-center">
            <h2 className="text-3xl font-bold text-pink-700 mb-2"> {/* Cor alterada */}
              - Giovana Ramos -
            </h2>
            <p className="text-2xl font-semibold text-pink-600 mb-6"> {/* Cor alterada */}
              Beautify
            </p>
            <p className="text-gray-700 text-lg mb-6">
              Sua beleza em primeiro lugar. Agende seu horário, explore nossos trabalhos e conheça a profissional por trás de cada transformação.
            </p>
            <button
              onClick={() => setCurrentPage('agendar')}
              className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-6 rounded-lg focus:outline-none focus:shadow-outline transition duration-300 ease-in-out transform hover:scale-105" // Cores alteradas
            >
              Agendar Agora!
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 to-pink-200 flex flex-col items-center justify-center p-4 font-sans"> {/* Cores alteradas */}
      {/* Tailwind CSS CDN */}
      <script src="https://cdn.tailwindcss.com"></script>
      {/* Inter Font */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>
        {`
          body {
            font-family: 'Inter', sans-serif;
          }
        `}
      </style>

      {/* Navigation Bar (simulating tabs) */}
      <nav className="w-full max-w-2xl bg-white p-4 rounded-xl shadow-xl mb-8 flex justify-around items-center space-x-4">
        <button
          onClick={() => setCurrentPage('home')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'home' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100' // Cores alteradas
          }`}
        >
          Início
        </button>
        <button
          onClick={() => setCurrentPage('agendar')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'agendar' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100' // Cores alteradas
          }`}
        >
          Agendar Horário
        </button>
        <button
          onClick={() => setCurrentPage('trabalhos')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'trabalhos' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100' // Cores alteradas
          }`}
        >
          Trabalhos
        </button>
        <button
          onClick={() => setCurrentPage('sobre')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'sobre' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100' // Cores alteradas
          }`}
        >
          Sobre Nós
        </button>
      </nav>

      {/* Page Content */}
      <div className="w-full max-w-2xl">
        {renderPage()}
      </div>

      {/* Display userId for debugging/identification in multi-user context */}
      {userId && (
        <div className="mt-8 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-md">
          Seu ID de Usuário: <span className="font-mono break-all">{userId}</span>
        </div>
      )}
    </div>
  );
};

export default App;
