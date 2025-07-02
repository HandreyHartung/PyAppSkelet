import React, { useState, useEffect, useRef } from 'react'; // Import useRef
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, where, getDocs, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore'; // Import updateDoc, doc, deleteDoc

// Main App Component
const App = () => {
  const [currentPage, setCurrentPage] = useState('home'); // State to manage current "tab"
  const [agendamentos, setAgendamentos] = useState([]); // State to store appointments (all users for admin view)
  const [servicos, setServicos] = useState([]); // State to store services
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null); // Current authenticated user ID
  const [isAdmin, setIsAdmin] = useState(false); // State to check if current user is admin
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- ADMIN CREDENTIALS (FOR DEMONSTRATION ONLY) ---
  // In a real application, these would be securely managed and NOT hardcoded.
  // You would typically create a user in Firebase Authentication console for Giovana.
  const ADMIN_EMAIL = "giovana.ramos.admin@estetica.com";
  const ADMIN_PASSWORD = "adminpassword123"; // Please change this for a real app!
  // --- END ADMIN CREDENTIALS ---

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
          // Check if the current user is the admin (for demonstration, comparing UIDs)
          // In a real app, you might check a custom claim or a specific user document field.
          if (user.email === ADMIN_EMAIL) { // A more robust check would be user.uid === ADMIN_UID
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
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
      return () => {
        unsubscribe();
      };
    } catch (e) {
      console.error("Erro na inicialização do Firebase:", e);
      setError(`Erro na inicialização: ${e.message}`);
      setLoading(false);
    }
  }, []);

  // Fetch all appointments (for admin view) and services when auth is ready and db is available
  useEffect(() => {
    if (db && isAuthReady) {
      // Fetch all appointments (now in a public collection with correct path)
      const agendamentosQuery = query(collection(db, `artifacts/${__app_id}/public/data/agendamentos`));
      const unsubscribeAgendamentos = onSnapshot(agendamentosQuery, (snapshot) => {
        const ags = [];
        snapshot.forEach((doc) => {
          ags.push({ id: doc.id, ...doc.data() });
        });
        ags.sort((a, b) => {
          if (a.timestamp && b.timestamp) {
            return a.timestamp.toDate() - b.timestamp.toDate();
          }
          const dateA = `${a.data} ${a.hora}`;
          const dateB = `${b.data} ${b.hora}`;
          return dateA.localeCompare(dateB);
        });
        setAgendamentos(ags);
      }, (err) => {
        console.error("Erro ao buscar agendamentos:", err);
        setError("Erro ao carregar agendamentos.");
      });

      // Fetch services (now in a public collection with correct path)
      const servicosQuery = query(collection(db, `artifacts/${__app_id}/public/data/servicos`));
      const unsubscribeServicos = onSnapshot(servicosQuery, (snapshot) => {
        const srvs = [];
        snapshot.forEach((doc) => {
          srvs.push({ id: doc.id, ...doc.data() });
        });
        setServicos(srvs);
      }, (err) => {
        console.error("Erro ao buscar serviços:", err);
        setError("Erro ao carregar serviços.");
      });

      return () => {
        unsubscribeAgendamentos();
        unsubscribeServicos();
      };
    }
  }, [db, isAuthReady]); // Removed userId from dependency, as we're fetching public data

  // Componente para a página de Agendar Horário
  const AgendarHorario = () => {
    const [nomeCliente, setNomeCliente] = useState('');
    const [servicosSelecionadosIds, setServicosSelecionadosIds] = useState([]); // Array de IDs de serviços selecionados
    const [data, setData] = useState('');
    const [hora, setHora] = useState('');
    const [metodoPagamento, setMetodoPagamento] = useState(''); // Novo estado para método de pagamento
    const [message, setMessage] = useState('');
    const [totalValor, setTotalValor] = useState(0);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [appointmentToCancel, setAppointmentToCancel] = useState(null);

    const qrCodeRef = useRef(null); // Ref para o elemento do QR Code

    // --- CHAVE PIX DA GIOVANA ---
    const GIOVANA_PIX_KEY = "jovanareisramos@gmail.com"; // Chave Pix fornecida
    // --- FIM CHAVE PIX ---

    // Lista de serviços hardcoded para o dropdown (combinada com os do Firestore)
    const hardcodedServicos = [
        { id: 'design-personalizado', nome: 'Design Personalizado', preco: 80.00, descricao: 'Design de sobrancelhas adaptado ao seu rosto.' },
        { id: 'henna', nome: 'Henna', preco: 60.00, descricao: 'Aplicação de henna para preenchimento e definição.' },
        { id: 'reaplicacao-henna', nome: 'Reaplicação de Henna', preco: 50.00, descricao: 'Retoque de henna.' },
        { id: 'tintura', nome: 'Tintura', preco: 70.00, descricao: 'Tintura de sobrancelhas para maior intensidade.' },
        { id: 'brow-lamination', nome: 'Brow Lamination', preco: 150.00, descricao: 'Técnica para alinhar e fixar os fios da sobrancelha.' },
        { id: 'epilacao-buco', nome: 'Epilação de Buço', preco: 30.00, descricao: 'Remoção de pelos do buço.' },
        { id: 'epilacao-buco-completa', nome: 'Epilação de Buço - Completa', preco: 40.00, descricao: 'Remoção completa de pelos do buço.' },
    ];

    // Combina os serviços hardcoded com os serviços carregados do Firestore
    const allAvailableServicos = [...hardcodedServicos];
    servicos.forEach(srv => {
        if (!allAvailableServicos.some(s => s.id === srv.id)) {
            allAvailableServicos.push(srv);
        }
    });

    // Calcula o valor total sempre que os serviços selecionados mudam
    useEffect(() => {
        let currentTotal = 0;
        servicosSelecionadosIds.forEach(id => {
            const servico = allAvailableServicos.find(s => s.id === id);
            if (servico) {
                currentTotal += servico.preco;
            }
        });
        setTotalValor(currentTotal);
    }, [servicosSelecionadosIds, allAvailableServicos]);

    // Efeito para gerar o QR Code quando o método de pagamento for Pix
    useEffect(() => {
        // Verifica se window.QRCode está definido, indicando que a biblioteca foi carregada
        if (metodoPagamento === 'Pix' && qrCodeRef.current && window.QRCode && GIOVANA_PIX_KEY) {
            // Limpa o QR Code anterior, se houver
            qrCodeRef.current.innerHTML = '';
            // Gera o novo QR Code
            new window.QRCode(qrCodeRef.current, { // Use window.QRCode
                text: GIOVANA_PIX_KEY,
                width: 128,
                height: 128,
                colorDark : "#333333",
                colorLight : "#ffffff",
                correctLevel : window.QRCode.CorrectLevel.H // Use window.QRCode.CorrectLevel
            });
        } else if (qrCodeRef.current) {
            // Limpa o QR Code se o método de pagamento não for Pix ou a biblioteca não estiver carregada
            qrCodeRef.current.innerHTML = '';
        }
    }, [metodoPagamento, GIOVANA_PIX_KEY]);


    const handleCheckboxChange = (serviceId) => {
        setServicosSelecionadosIds(prev =>
            prev.includes(serviceId)
                ? prev.filter(id => id !== serviceId)
                : [...prev, serviceId]
        );
    };

    const handleAgendar = async () => {
      setMessage(''); // Limpa mensagens anteriores
      if (!nomeCliente || servicosSelecionadosIds.length === 0 || !data || !hora || !metodoPagamento) {
        setMessage('Por favor, preencha o nome do cliente, selecione ao menos um serviço, a data, a hora e o método de pagamento.');
        return;
      }

      if (metodoPagamento === 'Pix' && !GIOVANA_PIX_KEY) { // Verifica se a chave Pix está definida
        setMessage('Erro: Chave Pix não configurada. Por favor, contate a Giovana.');
        return;
      }

      if (!db || !userId) {
        setMessage('Erro: Banco de dados não disponível ou usuário não autenticado.');
        return;
      }

      try {
        // 1. Verificar se o horário já está ocupado na coleção pública
        const agendamentosRef = collection(db, `artifacts/${__app_id}/public/data/agendamentos`);
        const q = query(
          agendamentosRef,
          where("data", "==", data),
          where("hora", "==", hora),
          where("status", "==", "confirmado") // Only check for confirmed appointments
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          setMessage('Este horário já está preenchido. Por favor, escolha outro.');
          return;
        }

        // Prepara os detalhes dos serviços selecionados para salvar
        const servicosParaSalvar = servicosSelecionadosIds.map(id => {
            const servico = allAvailableServicos.find(s => s.id === id);
            return {
                id: servico.id,
                nome: servico.nome,
                preco: servico.preco
            };
        });

        // 2. Se não estiver ocupado, adicionar o novo agendamento na coleção pública
        await addDoc(agendamentosRef, {
          cliente: nomeCliente,
          servicos: servicosParaSalvar, // Salva um array de serviços
          totalPreco: totalValor, // Salva o valor total
          data: data,
          hora: hora,
          metodoPagamento: metodoPagamento, // Salva o método de pagamento
          chavePix: metodoPagamento === 'Pix' ? GIOVANA_PIX_KEY : '', // Salva a chave Pix se for Pix (agora usando a constante)
          userId: userId, // Salva o ID do usuário que fez o agendamento
          timestamp: serverTimestamp(), // Adiciona um timestamp para ordenação
          status: 'confirmado' // Novo campo de status
        });
        setMessage('Agendamento realizado com sucesso!');
        setNomeCliente('');
        setServicosSelecionadosIds([]); // Limpa a seleção
        setData('');
        setHora('');
        setMetodoPagamento(''); // Limpa o método de pagamento
      } catch (e) {
        console.error("Erro ao adicionar agendamento: ", e);
        setMessage('Erro ao agendar. Por favor, tente novamente.');
      }
    };

    // Função para iniciar o processo de cancelamento pelo cliente
    const handleClientCancelClick = (agendamento) => {
        setAppointmentToCancel(agendamento);
        setShowCancelConfirm(true);
    };

    // Função para confirmar o cancelamento pelo cliente
    const confirmClientCancel = async () => {
        if (!appointmentToCancel || !db) return;

        try {
            const appointmentRef = doc(db, `artifacts/${__app_id}/public/data/agendamentos`, appointmentToCancel.id);
            await updateDoc(appointmentRef, {
                status: 'cancelado'
            });
            setMessage('Agendamento cancelado com sucesso!');
        } catch (e) {
            console.error("Erro ao cancelar agendamento:", e);
            setMessage('Erro ao cancelar agendamento. Tente novamente.');
        } finally {
            setShowCancelConfirm(false);
            setAppointmentToCancel(null);
        }
    };

    // Função para solicitar reagendamento
    const handleRequestReschedule = (agendamento) => {
        setMessage(`Para reagendar o serviço de ${agendamento.servicos.map(s => s.nome).join(', ')} em ${agendamento.data} às ${agendamento.hora}, por favor, entre em contato com a Giovana pelo WhatsApp ou telefone.`);
        // You could also open a new modal with contact info here
    };

    // Filtra agendamentos para mostrar apenas os do usuário atual
    const meusAgendamentos = agendamentos.filter(ag => ag.userId === userId);

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Agendar Horário</h2>
        <div className="mb-4">
          <label htmlFor="nomeCliente" className="block text-gray-700 text-sm font-semibold mb-2">Nome do Cliente:</label>
          <input
            type="text"
            id="nomeCliente"
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
            value={nomeCliente}
            onChange={(e) => setNomeCliente(e.target.value)}
            placeholder="Seu nome"
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-semibold mb-2">Serviços Desejados:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-gray-300 rounded-lg p-3 max-h-60 overflow-y-auto"> {/* Grid para serviços */}
            {allAvailableServicos.length === 0 ? (
              <p className="text-sm text-gray-500 col-span-full text-center">Nenhum serviço cadastrado. Por favor, contate a Giovana.</p>
            ) : (
              allAvailableServicos.map((srv) => (
                <div
                  key={srv.id}
                  className={`flex items-center p-3 rounded-lg border cursor-pointer transition duration-200 ease-in-out
                    ${servicosSelecionadosIds.includes(srv.id) ? 'bg-pink-100 border-pink-500 shadow-md' : 'bg-white border-gray-200 hover:bg-gray-50'}
                  `}
                  onClick={() => handleCheckboxChange(srv.id)}
                >
                  <input
                    type="checkbox"
                    id={`service-${srv.id}`}
                    className="form-checkbox h-5 w-5 text-pink-600 rounded focus:ring-pink-500 cursor-pointer"
                    checked={servicosSelecionadosIds.includes(srv.id)}
                    onChange={() => {}} // Empty onChange as click handler is on parent div
                  />
                  <label htmlFor={`service-${srv.id}`} className="ml-3 text-gray-800 text-sm flex-grow cursor-pointer">
                    <span className="font-semibold">{srv.nome}</span>
                    <br />
                    <span className="text-xs text-gray-600">R$ {srv.preco ? srv.preco.toFixed(2).replace('.', ',') : '0,00'}</span>
                  </label>
                </div>
              ))
            )}
          </div>
          <p className="text-lg font-bold text-gray-800 mt-4 text-center">
            Valor Total: R$ {totalValor.toFixed(2).replace('.', ',')}
          </p>
        </div>
        <div className="mb-4">
          <label htmlFor="data" className="block text-gray-700 text-sm font-semibold mb-2">Data (DD/MM/AAAA):</label>
          <input
            type="text"
            id="data"
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
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
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            placeholder="Ex: 14:30"
          />
        </div>

        {/* Opções de Pagamento */}
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-semibold mb-2">Método de Pagamento:</label>
          <div className="flex flex-col space-y-2">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-5 w-5 text-pink-600"
                name="metodoPagamento"
                value="Pix"
                checked={metodoPagamento === 'Pix'}
                onChange={(e) => setMetodoPagamento(e.target.value)}
              />
              <span className="ml-2 text-gray-700">Pix</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-5 w-5 text-pink-600"
                name="metodoPagamento"
                value="Debito/Credito"
                checked={metodoPagamento === 'Debito/Credito'}
                onChange={(e) => setMetodoPagamento(e.target.value)}
              />
              <span className="ml-2 text-gray-700">Débito/Crédito</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-5 w-5 text-pink-600"
                name="metodoPagamento"
                value="Dinheiro"
                checked={metodoPagamento === 'Dinheiro'}
                onChange={(e) => setMetodoPagamento(e.target.value)}
              />
              <span className="ml-2 text-gray-700">Dinheiro</span>
            </label>
          </div>
        </div>

        {/* Campo para Chave Pix (condicional) */}
        {metodoPagamento === 'Pix' && (
          <div className="mb-6 p-3 bg-pink-50 rounded-lg border border-pink-200 text-center">
            <label htmlFor="chavePix" className="block text-gray-700 text-sm font-semibold mb-2">Chave Pix da Giovana:</label>
            <input
              type="text"
              id="chavePix"
              className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500 bg-gray-100 cursor-not-allowed text-center"
              value={GIOVANA_PIX_KEY}
              readOnly // Chave Pix é apenas para visualização
            />
            <p className="text-xs text-gray-600 mt-2">Copie a chave acima ou escaneie o QR Code:</p>
            <div ref={qrCodeRef} className="mx-auto mt-4 p-2 bg-white rounded-lg shadow-inner" style={{ width: '128px', height: '128px' }}>
              {/* QR Code será renderizado aqui */}
            </div>
            <p className="text-sm text-red-600 font-semibold mt-4">
              **Atenção:** O valor total de R$ {totalValor.toFixed(2).replace('.', ',')} deve ser inserido manualmente no seu aplicativo bancário.
            </p>
          </div>
        )}

        <button
          onClick={handleAgendar}
          className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full transition duration-300 ease-in-out transform hover:scale-105"
        >
          Confirmar Agendamento
        </button>
        {message && <p className="text-center mt-4 text-sm text-gray-600">{message}</p>}

        <h3 className="text-xl font-bold text-gray-800 mt-8 mb-4 text-center">Meus Agendamentos</h3>
        {meusAgendamentos.length === 0 ? (
          <p className="text-center text-gray-600">Nenhum agendamento cadastrado por você ainda.</p>
        ) : (
          <ul className="space-y-3">
            {meusAgendamentos.map((ag) => (
              <li key={ag.id} className={`bg-pink-50 p-4 rounded-lg shadow-sm border ${ag.status === 'cancelado' ? 'border-red-400 opacity-60 line-through' : 'border-pink-200'}`}>
                <p className="text-gray-800 font-semibold">{ag.cliente}</p>
                <p className="text-gray-700 text-sm">
                  Serviços: {ag.servicos && ag.servicos.length > 0 ?
                    ag.servicos.map(s => s.nome).join(', ') : 'N/A'}
                </p>
                <p className="text-gray-700 text-sm">Valor Total: R$ {ag.totalPreco ? ag.totalPreco.toFixed(2).replace('.', ',') : '0,00'}</p>
                <p className="text-gray-700 text-sm">Método de Pagamento: {ag.metodoPagamento || 'N/A'}</p>
                {ag.metodoPagamento === 'Pix' && ag.chavePix && (
                  <p className="text-gray-700 text-sm">Chave Pix: {ag.chavePix}</p>
                )}
                <p className="text-700 text-sm">Data: {ag.data} às {ag.hora}</p>
                <p className="text-gray-700 text-sm font-bold">Status: {ag.status ? ag.status.charAt(0).toUpperCase() + ag.status.slice(1) : 'Confirmado'}</p>
                {ag.status === 'confirmado' && (
                    <div className="flex justify-end space-x-2 mt-3">
                        <button
                            onClick={() => handleRequestReschedule(ag)}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-2 rounded-lg transition duration-300 ease-in-out"
                        >
                            Solicitar Reagendamento
                        </button>
                        <button
                            onClick={() => handleClientCancelClick(ag)}
                            className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-2 rounded-lg transition duration-300 ease-in-out"
                        >
                            Cancelar
                        </button>
                    </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-500 mt-4 text-center">
          Para visualizar *todos* os horários preenchidos, acesse o Painel de Administração.
        </p>

        {/* Modal de Confirmação de Cancelamento */}
        {showCancelConfirm && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl text-center">
                    <p className="text-lg font-semibold mb-4">Tem certeza que deseja cancelar este agendamento?</p>
                    <p className="text-sm text-gray-700 mb-6">
                        Serviço: {appointmentToCancel?.servicos?.map(s => s.nome).join(', ')}<br/>
                        Data: {appointmentToCancel?.data} às {appointmentToCancel?.hora}
                    </p>
                    <div className="flex justify-center space-x-4">
                        <button
                            onClick={confirmClientCancel}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
                        >
                            Sim, Cancelar
                        </button>
                        <button
                            onClick={() => setShowCancelConfirm(false)}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300"
                        >
                            Não, Manter
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  };

  // Componente para a página de Trabalhos
  const Trabalhos = () => {
    // Combina os serviços hardcoded com os serviços carregados do Firestore para exibição
    const hardcodedServicos = [
        { id: 'design-personalizado', nome: 'Design Personalizado', preco: 80.00, descricao: 'Design de sobrancelhas adaptado ao seu rosto.' },
        { id: 'henna', nome: 'Henna', preco: 60.00, descricao: 'Aplicação de henna para preenchimento e definição.' },
        { id: 'reaplicacao-henna', nome: 'Reaplicacao de Henna', preco: 50.00, descricao: 'Retoque de henna.' },
        { id: 'tintura', nome: 'Tintura', preco: 70.00, descricao: 'Tintura de sobrancelhas para maior intensidade.' },
        { id: 'brow-lamination', nome: 'Brow Lamination', preco: 150.00, descricao: 'Técnica para alinhar e fixar os fios da sobrancelha.' },
        { id: 'epilacao-buco', nome: 'Epilacao de Buço', preco: 30.00, descricao: 'Remoção de pelos do buço.' },
        { id: 'epilacao-buco-completa', nome: 'Epilacao de Buço - Completa', preco: 40.00, descricao: 'Remoção completa de pelos do buço.' },
    ];

    const allAvailableServicos = [...hardcodedServicos];
    servicos.forEach(srv => {
        if (!allAvailableServicos.some(s => s.id === srv.id)) {
            allAvailableServicos.push(srv);
        }
    });

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md mx-auto text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Nossos Trabalhos</h2>
        <p className="text-gray-700 text-lg">
          Explore nossos serviços e veja a qualidade dos nossos trabalhos!
        </p>
        <p className="text-gray-600 text-sm mt-4">
          Clique em um serviço para ver exemplos visuais.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4">
          {allAvailableServicos.length === 0 ? (
            <p className="text-center text-gray-600">Nenhum serviço cadastrado para exibir trabalhos.</p>
          ) : (
            allAvailableServicos.map((srv) => (
              <div key={srv.id} className="bg-pink-50 p-4 rounded-lg shadow-sm border border-pink-200 cursor-pointer hover:bg-pink-100 transition duration-300">
                <h3 className="text-lg font-semibold text-gray-800">{srv.nome}</h3>
                <p className="text-gray-600 text-sm">{srv.descricao}</p>
                {/* Futuramente, ao clicar aqui, poderia ir para uma galeria de imagens específica do serviço */}
                <div className="mt-2 text-gray-400 text-sm">
                  [Imagens de {srv.nome}]
                </div>
              </div>
            ))
          )}
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

  // Componente de Login para o Admin
  const AdminLogin = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginMessage, setLoginMessage] = useState('');

    const handleLogin = async () => {
      setLoginMessage('');
      if (!email || !password) {
        setLoginMessage('Por favor, preencha o email e a senha.');
        return;
      }

      if (!auth) {
        setLoginMessage('Serviço de autenticação não disponível.');
        return;
      }

      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // Check if the logged-in user is the actual admin (using hardcoded email for demo)
        if (userCredential.user.email === ADMIN_EMAIL) {
          onLoginSuccess(); // Call callback to switch to AdminPanel
        } else {
          setLoginMessage('Credenciais de administrador inválidas.');
          await signOut(auth); // Sign out if not the admin
        }
      } catch (error) {
        console.error("Erro de login:", error);
        if (error.code === 'auth/operation-not-allowed') {
            setLoginMessage('Erro: Login por e-mail/senha não está ativado no Firebase. Por favor, ative-o no console do Firebase > Authentication > Sign-in method.');
        } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            setLoginMessage('Credenciais inválidas. Verifique o email e a senha.');
        } else {
            setLoginMessage('Erro ao fazer login. Por favor, tente novamente.');
        }
      }
    };

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md mx-auto text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Login de Administrador</h2>
        <div className="mb-4">
          <label htmlFor="adminEmail" className="block text-gray-700 text-sm font-semibold mb-2">Email:</label>
          <input
            type="email"
            id="adminEmail"
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
          />
        </div>
        <div className="mb-6">
          <label htmlFor="adminPassword" className="block text-gray-700 text-sm font-semibold mb-2">Senha:</label>
          <input
            type="password"
            id="adminPassword"
            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sua senha"
          />
        </div>
        <button
          onClick={handleLogin}
          className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full transition duration-300 ease-in-out transform hover:scale-105"
        >
          Entrar
        </button>
        {loginMessage && <p className="text-center mt-4 text-sm text-red-600">{loginMessage}</p>}
        <p className="text-xs text-gray-500 mt-4">
          Para demonstração, use: Email: {ADMIN_EMAIL} | Senha: {ADMIN_PASSWORD}
        </p>
      </div>
    );
  };

  // Componente para o Painel de Administração (Giovana)
  const AdminPanel = () => {
    const [novoServicoNome, setNovoServicoNome] = useState('');
    const [novoServicoPreco, setNovoServicoPreco] = useState('');
    const [novoServicoDescricao, setNovoServicoDescricao] = useState('');
    const [adminMessage, setAdminMessage] = useState('');
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState(null);
    const [editNomeCliente, setEditNomeCliente] = useState('');
    const [editServicosSelecionadosIds, setEditServicosSelecionadosIds] = useState([]);
    const [editData, setEditData] = useState('');
    const [editHora, setEditHora] = useState('');
    const [editMetodoPagamento, setEditMetodoPagamento] = useState('');
    const [editTotalValor, setEditTotalValor] = useState(0);

    // Lista de serviços hardcoded para o dropdown (combinada com os do Firestore)
    const hardcodedServicos = [
        { id: 'design-personalizado', nome: 'Design Personalizado', preco: 80.00, descricao: 'Design de sobrancelhas adaptado ao seu rosto.' },
        { id: 'henna', nome: 'Henna', preco: 60.00, descricao: 'Aplicação de henna para preenchimento e definição.' },
        { id: 'reaplicacao-henna', nome: 'Reaplicação de Henna', preco: 50.00, descricao: 'Retoque de henna.' },
        { id: 'tintura', nome: 'Tintura', preco: 70.00, descricao: 'Tintura de sobrancelhas para maior intensidade.' },
        { id: 'brow-lamination', nome: 'Brow Lamination', preco: 150.00, descricao: 'Técnica para alinhar e fixar os fios da sobrancelha.' },
        { id: 'epilacao-buco', nome: 'Epilação de Buço', preco: 30.00, descricao: 'Remoção de pelos do buço.' },
        { id: 'epilacao-buco-completa', nome: 'Epilação de Buço - Completa', preco: 40.00, descricao: 'Remoção completa de pelos do buço.' },
    ];

    // Combina os serviços hardcoded com os serviços carregados do Firestore
    const allAvailableServicos = [...hardcodedServicos];
    servicos.forEach(srv => {
        if (!allAvailableServicos.some(s => s.id === srv.id)) {
            allAvailableServicos.push(srv);
        }
    });

    // Calcula o valor total para o modal de edição
    useEffect(() => {
        let currentTotal = 0;
        editServicosSelecionadosIds.forEach(id => {
            const servico = allAvailableServicos.find(s => s.id === id);
            if (servico) {
                currentTotal += servico.preco;
            }
        });
        setEditTotalValor(currentTotal);
    }, [editServicosSelecionadosIds, allAvailableServicos]);

    const handleAddServico = async () => {
      setAdminMessage('');
      if (!novoServicoNome || !novoServicoPreco || !novoServicoDescricao) {
        setAdminMessage('Por favor, preencha todos os campos do serviço.');
        return;
      }
      if (isNaN(parseFloat(novoServicoPreco))) {
        setAdminMessage('Preço deve ser um número válido.');
        return;
      }

      if (!db) {
        setAdminMessage('Erro: Banco de dados não disponível.');
        return;
      }

      try {
        await addDoc(collection(db, `artifacts/${__app_id}/public/data/servicos`), {
          nome: novoServicoNome,
          preco: parseFloat(novoServicoPreco),
          descricao: novoServicoDescricao,
          timestamp: serverTimestamp()
        });
        setAdminMessage('Serviço adicionado com sucesso!');
        setNovoServicoNome('');
        setNovoServicoPreco('');
        setNovoServicoDescricao('');
      } catch (e) {
        console.error("Erro ao adicionar serviço: ", e);
        setAdminMessage('Erro ao adicionar serviço. Tente novamente.');
      }
    };

    // Agrupar agendamentos por cliente para o histórico de gastos
    const clientesHistorico = {};
    agendamentos.forEach(ag => {
        if (!clientesHistorico[ag.cliente]) {
            clientesHistorico[ag.cliente] = {
                totalGasto: 0,
                agendamentos: []
            };
        }
        // Soma o totalPreco se disponível, caso contrário, soma o preco individual (para compatibilidade com agendamentos antigos)
        clientesHistorico[ag.cliente].totalGasto += (ag.totalPreco || ag.preco || 0);
        clientesHistorico[ag.cliente].agendamentos.push(ag);
    });

    const handleLogout = async () => {
      if (auth) {
        try {
          await signOut(auth);
          setCurrentPage('home'); // Redirect to home after logout
        } catch (e) {
          console.error("Erro ao fazer logout:", e);
        }
      }
    };

    // Admin: Iniciar edição de agendamento
    const handleAdminEditClick = (agendamento) => {
        setEditingAppointment(agendamento);
        setEditNomeCliente(agendamento.cliente);
        setEditServicosSelecionadosIds(agendamento.servicos.map(s => s.id));
        setEditData(agendamento.data);
        setEditHora(agendamento.hora);
        setEditMetodoPagamento(agendamento.metodoPagamento || '');
        setEditTotalValor(agendamento.totalPreco || 0);
        setShowEditModal(true);
    };

    // Admin: Salvar edição de agendamento
    const handleSaveEditedAppointment = async () => {
        if (!editingAppointment || !db) return;

        setAdminMessage('');
        if (!editNomeCliente || editServicosSelecionadosIds.length === 0 || !editData || !editHora || !editMetodoPagamento) {
            setAdminMessage('Por favor, preencha todos os campos do agendamento.');
            return;
        }

        try {
            // Check for time conflicts for the new date/time, excluding the current appointment being edited
            const agendamentosRef = collection(db, `artifacts/${__app_id}/public/data/agendamentos`);
            const q = query(
                agendamentosRef,
                where("data", "==", editData),
                where("hora", "==", editHora),
                where("status", "==", "confirmado")
            );
            const querySnapshot = await getDocs(q);

            const conflictFound = querySnapshot.docs.some(doc => doc.id !== editingAppointment.id);

            if (conflictFound) {
                setAdminMessage('O novo horário selecionado já está preenchido. Por favor, escolha outro.');
                return;
            }

            const appointmentRef = doc(db, `artifacts/${__app_id}/public/data/agendamentos`, editingAppointment.id);

            const servicosParaSalvar = editServicosSelecionadosIds.map(id => {
                const servico = allAvailableServicos.find(s => s.id === id);
                return {
                    id: servico.id,
                    nome: servico.nome,
                    preco: servico.preco
                };
            });

            await updateDoc(appointmentRef, {
                cliente: editNomeCliente,
                servicos: servicosParaSalvar,
                totalPreco: editTotalValor,
                data: editData,
                hora: editHora,
                metodoPagamento: editMetodoPagamento,
                chavePix: editMetodoPagamento === 'Pix' ? "jovanareisramos@gmail.com" : '', // Use a chave Pix fixa
                // status remains the same unless explicitly changed
            });
            setAdminMessage('Agendamento atualizado com sucesso!');
            setShowEditModal(false);
            setEditingAppointment(null);
        } catch (e) {
            console.error("Erro ao atualizar agendamento:", e);
            setAdminMessage('Erro ao atualizar agendamento. Tente novamente.');
        }
    };

    // Admin: Cancelar agendamento
    const handleAdminCancelAppointment = async (appointmentId) => {
        setAdminMessage('');
        if (!db) return;

        // Using a simple confirm for admin for now, but could be a custom modal
        if (window.confirm("Tem certeza que deseja cancelar este agendamento?")) {
            try {
                const appointmentRef = doc(db, `artifacts/${__app_id}/public/data/agendamentos`, appointmentId);
                await updateDoc(appointmentRef, {
                    status: 'cancelado'
                });
                setAdminMessage('Agendamento cancelado com sucesso!');
            } catch (e) {
                console.error("Erro ao cancelar agendamento:", e);
                setAdminMessage('Erro ao cancelar agendamento. Tente novamente.');
            }
        }
    };

    const handleEditCheckboxChange = (serviceId) => {
        setEditServicosSelecionadosIds(prev =>
            prev.includes(serviceId)
                ? prev.filter(id => id !== serviceId)
                : [...prev, serviceId]
        );
    };

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Painel de Administração</h2>
        <p className="text-red-500 text-sm mb-4 text-center">
            **Atenção:** Os dados de login são para demonstração. Em um aplicativo real, use o console do Firebase para gerenciar usuários e regras de segurança.
        </p>
        <button
          onClick={handleLogout}
          className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline mb-6 float-right"
        >
          Sair do Admin
        </button>
        <div className="clear-both mb-4"></div> {/* Clear float */}

        {/* Gerenciar Serviços */}
        <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Gerenciar Serviços</h3>
          <div className="mb-4">
            <label htmlFor="novoServicoNome" className="block text-gray-700 text-sm font-semibold mb-2">Nome do Serviço:</label>
            <input
              type="text"
              id="novoServicoNome"
              className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
              value={novoServicoNome}
              onChange={(e) => setNovoServicoNome(e.target.value)}
              placeholder="Ex: Micropigmentação"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="novoServicoPreco" className="block text-gray-700 text-sm font-semibold mb-2">Preço (R$):</label>
            <input
              type="number"
              id="novoServicoPreco"
              className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
              value={novoServicoPreco}
              onChange={(e) => setNovoServicoPreco(e.target.value)}
              placeholder="Ex: 350.00"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="novoServicoDescricao" className="block text-gray-700 text-sm font-semibold mb-2">Descrição:</label>
            <textarea
              id="novoServicoDescricao"
              className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500 h-24"
              value={novoServicoDescricao}
              onChange={(e) => setNovoServicoDescricao(e.target.value)}
              placeholder="Breve descrição do serviço"
            ></textarea>
          </div>
          <button
            onClick={handleAddServico}
            className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline w-full transition duration-300 ease-in-out transform hover:scale-105"
          >
            Adicionar Serviço
          </button>
          {adminMessage && <p className="text-center mt-4 text-sm text-gray-600">{adminMessage}</p>}

          <h4 className="text-lg font-bold text-gray-800 mt-8 mb-4">Serviços Cadastrados</h4>
          {servicos.length === 0 ? (
            <p className="text-center text-gray-600">Nenhum serviço cadastrado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {servicos.map((srv) => (
                <li key={srv.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{srv.nome} - R$ {srv.preco ? srv.preco.toFixed(2).replace('.', ',') : '0,00'}</p>
                    <p className="text-sm text-gray-600">{srv.descricao}</p>
                  </div>
                  {/* Botões de editar/excluir futuramente */}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Horários Agendados (Preenchidos) */}
        <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Horários Agendados (Preenchidos)</h3>
            {agendamentos.length === 0 ? (
                <p className="text-center text-gray-600">Nenhum horário preenchido ainda.</p>
            ) : (
                <ul className="space-y-3">
                    {agendamentos.map((ag) => (
                        <li key={ag.id} className={`bg-white p-4 rounded-lg shadow-sm border ${ag.status === 'cancelado' ? 'border-red-400 opacity-60 line-through' : 'border-gray-100'}`}>
                            <p className="text-gray-800 font-semibold">Cliente: {ag.cliente} (ID: {ag.userId ? ag.userId.substring(0, 8) + '...' : 'N/A'})</p>
                            <p className="text-gray-700 text-sm">
                              Serviços: {ag.servicos && ag.servicos.length > 0 ?
                                ag.servicos.map(s => s.nome).join(', ') : 'N/A'}
                            </p>
                            <p className="text-gray-700 text-sm">Valor Total: R$ {ag.totalPreco ? ag.totalPreco.toFixed(2).replace('.', ',') : '0,00'}</p>
                            <p className="text-gray-700 text-sm">Método de Pagamento: {ag.metodoPagamento || 'N/A'}</p>
                            {ag.metodoPagamento === 'Pix' && ag.chavePix && (
                              <p className="text-gray-700 text-sm">Chave Pix: {ag.chavePix}</p>
                            )}
                            <p className="text-gray-700 text-sm">Data: {ag.data} às {ag.hora}</p>
                            <p className="text-gray-700 text-sm font-bold">Status: {ag.status ? ag.status.charAt(0).toUpperCase() + ag.status.slice(1) : 'Confirmado'}</p>
                            <div className="flex justify-end space-x-2 mt-3">
                                <button
                                    onClick={() => handleAdminEditClick(ag)}
                                    className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-2 rounded-lg transition duration-300 ease-in-out"
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleAdminCancelAppointment(ag.id)}
                                    className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-2 rounded-lg transition duration-300 ease-in-out"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        {/* Histórico de Clientes e Valores Gastos */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Histórico de Clientes e Gastos</h3>
            {Object.keys(clientesHistorico).length === 0 ? (
                <p className="text-center text-gray-600">Nenhum cliente com histórico de gastos ainda.</p>
            ) : (
                <ul className="space-y-3">
                    {Object.entries(clientesHistorico).map(([clienteNome, dados]) => (
                        <li key={clienteNome} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                            <p className="text-gray-800 font-semibold text-lg">{clienteNome}</p>
                            <p className="text-gray-700 text-md">Total Gasto: R$ {dados.totalGasto.toFixed(2).replace('.', ',')}</p>
                            <details className="mt-2">
                                <summary className="text-pink-600 cursor-pointer text-sm">Ver agendamentos ({dados.agendamentos.length})</summary>
                                <ul className="list-disc list-inside text-sm text-gray-600 mt-2">
                                    {dados.agendamentos.map((ag, index) => (
                                        <li key={ag.id || index}>
                                            {ag.servicos && ag.servicos.length > 0 ?
                                                ag.servicos.map(s => s.nome).join(', ') : 'N/A'} em {ag.data} às {ag.hora} (R$ {ag.totalPreco ? ag.totalPreco.toFixed(2).replace('.', ',') : '0,00'})
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        {/* Modal de Edição de Agendamento (Admin) */}
        {showEditModal && editingAppointment && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md">
                    <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">Editar Agendamento</h3>
                    <div className="mb-4">
                        <label htmlFor="editNomeCliente" className="block text-gray-700 text-sm font-semibold mb-2">Nome do Cliente:</label>
                        <input
                            type="text"
                            id="editNomeCliente"
                            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
                            value={editNomeCliente}
                            onChange={(e) => setEditNomeCliente(e.target.value)}
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-semibold mb-2">Serviços Desejados:</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto">
                            {allAvailableServicos.map((srv) => (
                                <div
                                    key={srv.id}
                                    className={`flex items-center p-2 rounded-lg border cursor-pointer transition duration-200 ease-in-out
                                        ${editServicosSelecionadosIds.includes(srv.id) ? 'bg-pink-100 border-pink-500 shadow-md' : 'bg-white border-gray-200 hover:bg-gray-50'}
                                    `}
                                    onClick={() => handleEditCheckboxChange(srv.id)}
                                >
                                    <input
                                        type="checkbox"
                                        id={`edit-service-${srv.id}`}
                                        className="form-checkbox h-4 w-4 text-pink-600 rounded focus:ring-pink-500 cursor-pointer"
                                        checked={editServicosSelecionadosIds.includes(srv.id)}
                                        onChange={() => {}}
                                    />
                                    <label htmlFor={`edit-service-${srv.id}`} className="ml-2 text-gray-800 text-sm flex-grow cursor-pointer">
                                        <span className="font-semibold">{srv.nome}</span>
                                        <br />
                                        <span className="text-xs text-gray-600">R$ {srv.preco ? srv.preco.toFixed(2).replace('.', ',') : '0,00'}</span>
                                    </label>
                                </div>
                            ))}
                        </div>
                        <p className="text-lg font-bold text-gray-800 mt-4 text-center">
                            Valor Total: R$ {editTotalValor.toFixed(2).replace('.', ',')}
                        </p>
                    </div>
                    <div className="mb-4">
                        <label htmlFor="editData" className="block text-gray-700 text-sm font-semibold mb-2">Data (DD/MM/AAAA):</label>
                        <input
                            type="text"
                            id="editData"
                            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
                            value={editData}
                            onChange={(e) => setEditData(e.target.value)}
                        />
                    </div>
                    <div className="mb-6">
                        <label htmlFor="editHora" className="block text-gray-700 text-sm font-semibold mb-2">Hora (HH:MM):</label>
                        <input
                            type="text"
                            id="editHora"
                            className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:ring-2 focus:ring-pink-500"
                            value={editHora}
                            onChange={(e) => setEditHora(e.target.value)}
                        />
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-semibold mb-2">Método de Pagamento:</label>
                        <div className="flex flex-col space-y-2">
                            <label className="inline-flex items-center">
                                <input
                                    type="radio"
                                    className="form-radio h-5 w-5 text-pink-600"
                                    name="editMetodoPagamento"
                                    value="Pix"
                                    checked={editMetodoPagamento === 'Pix'}
                                    onChange={(e) => setEditMetodoPagamento(e.target.value)}
                                />
                                <span className="ml-2 text-gray-700">Pix</span>
                            </label>
                            <label className="inline-flex items-center">
                                <input
                                    type="radio"
                                    className="form-radio h-5 w-5 text-pink-600"
                                    name="editMetodoPagamento"
                                    value="Debito/Credito"
                                    checked={editMetodoPagamento === 'Debito/Credito'}
                                    onChange={(e) => setEditMetodoPagamento(e.target.value)}
                                />
                                <span className="ml-2 text-gray-700">Débito/Crédito</span>
                            </label>
                            <label className="inline-flex items-center">
                                <input
                                    type="radio"
                                    className="form-radio h-5 w-5 text-pink-600"
                                    name="editMetodoPagamento"
                                    value="Dinheiro"
                                    checked={editMetodoPagamento === 'Dinheiro'}
                                    onChange={(e) => setEditMetodoPagamento(e.target.value)}
                                />
                                <span className="ml-2 text-gray-700">Dinheiro</span>
                            </label>
                        </div>
                    </div>
                    <div className="flex justify-end space-x-4">
                        <button
                            onClick={handleSaveEditedAppointment}
                            className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
                        >
                            Salvar Alterações
                        </button>
                        <button
                            onClick={() => setShowEditModal(false)}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300"
                        >
                            Cancelar
                        </button>
                    </div>
                    {adminMessage && <p className="text-center mt-4 text-sm text-red-600">{adminMessage}</p>}
                </div>
            </div>
        )}
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
      case 'admin':
        // If admin is logged in, show AdminPanel, otherwise show AdminLogin
        return isAdmin ? <AdminPanel /> : <AdminLogin onLoginSuccess={() => setCurrentPage('admin')} />;
      default:
        return (
          <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-md mx-auto text-center">
            <h2 className="text-3xl font-bold text-pink-700 mb-2">
              - Giovana Ramos -
            </h2>
            <p className="text-2xl font-semibold text-pink-600 mb-6">
              Beautify
            </p>
            <p className="text-gray-700 text-lg mb-6">
              Sua beleza em primeiro lugar. Agende seu horário, explore nossos trabalhos e conheça a profissional por trás de cada transformação.
            </p>
            <button
              onClick={() => setCurrentPage('agendar')}
              className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-6 rounded-lg focus:outline-none focus:shadow-outline transition duration-300 ease-in-out transform hover:scale-105"
            >
              Agendar Agora!
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 to-pink-200 flex flex-col items-center justify-center p-4 font-sans">
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
      {/* QR Code Library - Loaded directly in JSX */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode.js/1.0.0/qrcode.min.js"></script>

      {/* Navigation Bar (simulating tabs) */}
      <nav className="w-full max-w-2xl bg-white p-4 rounded-xl shadow-xl mb-8 flex justify-around items-center space-x-4">
        <button
          onClick={() => setCurrentPage('home')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'home' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Início
        </button>
        <button
          onClick={() => setCurrentPage('agendar')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'agendar' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Agendar Horário
        </button>
        <button
          onClick={() => setCurrentPage('trabalhos')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'trabalhos' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Trabalhos
        </button>
        <button
          onClick={() => setCurrentPage('sobre')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'sobre' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Sobre Nós
        </button>
        {/* Nova aba para o Painel de Administração - agora leva para o login */}
        <button
          onClick={() => setCurrentPage('admin')}
          className={`px-4 py-2 rounded-lg text-lg font-semibold transition duration-300 ease-in-out ${
            currentPage === 'admin' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Admin
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