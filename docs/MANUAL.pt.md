# Manual do Usuário do BookSocial Studio

## Visão Geral

O BookSocial Studio transforma um livro em conteúdo social com prevenção de spoilers para Páginas do Facebook e contas vinculadas do Instagram Business. Ele ajuda a importar e analisar manuscritos, gerar rascunhos e recursos visuais, programar postagens, publicar conteúdo, gerenciar comentários e revisar métricas.

O aplicativo é voltado ao funcionamento local (local-first). Seus dados residem em um banco de dados SQLite local e em arquivos locais. Segredos como os tokens do Facebook e as chaves de API da IA são armazenados criptografados no arquivo `secrets.enc` dentro da pasta de dados, não no banco de dados.

A interface é bilíngue, em italiano e inglês. Os itens de navegação principais são: **Books**, **Planner**, **Scheduled**, **Insights**, **Connection**, **Page management** e **Settings**.

Para instalação e configuração inicial, consulte [SETUP.md](./SETUP.md). Para detalhes do provedor de IA, consulte [PROVIDERS.md](./PROVIDERS.md). Para configurações e comportamento específicos do Instagram, consulte [INSTAGRAM.md](./INSTAGRAM.md). Para notas sobre a máquina local testada e geração de imagens, consulte [TESTED-ON.md](./TESTED-ON.md).

## Conceitos Principais

| Conceito | Significado |
| --- | --- |
| Books | Manuscritos Markdown importados. O aplicativo analisa cada livro em um perfil, personagens, capítulos e uma bíblia visual. |
| Pages | Páginas do Facebook conectadas. Uma Página também pode ter uma conta do Instagram Business vinculada. |
| Drafts | Conteúdo social gerado que ainda não foi programado ou publicado. |
| Postagens programadas | Conteúdo na fila para publicação futura. Alguns itens são programados nativamente no Facebook, enquanto outros são gerenciados pelo programador interno do aplicativo. |
| Provedor de texto | O provedor de IA usado para escrever postagens, analisar livros, criar perfis, personagens, hashtags e outras tarefas de texto. |
| Provedor de imagem | O provedor ou motor local usado para gerar imagens de cena e recursos visuais. |
| Bíblia visual | Um conjunto de referências visuais estruturadas para o livro, incluindo a aparência dos personagens, cartões de cena, trajes, adereços, detalhes do mundo, personagens secundários e a presença de personagens por capítulo. |

### Modelo de Publicação

| Tipo de conteúdo | Como é programado | O que deve estar em execução no momento da publicação |
| --- | --- | --- |
| Postagens nativas do Facebook | Programado no Facebook | O Facebook as publica mesmo que o BookSocial Studio esteja desligado. |
| Facebook Reels e Stories | Programador interno | O servidor do BookSocial Studio deve estar em execução. |
| Itens do Instagram | Programador interno | O servidor do BookSocial Studio deve estar em execução. |

O Instagram não tem programação nativa neste aplicativo. Cada item programado do Instagram é um trabalho local separado vinculado ao seu equivalente (gêmeo) no Facebook.

## Índice

- [Livros](#livros)
- [Análise do Livro e a Bíblia Visual](#análise-do-livro-e-a-bíblia-visual)
- [Detalhes do Livro](#detalhes-do-livro)
- [Conexão](#conexão)
- [Gerenciamento da Página](#gerenciamento-da-página)
- [Planejador](#planejador)
- [Programados](#programados)
- [Métricas](#métricas)
- [Configurações: IA](#configurações-ia)
- [Configuração da Graph API: Meta](#configuração-da-graph-api-meta)
- [Fluxos de Trabalho Comuns](#fluxos-de-trabalho-comuns)
- [Notas Importantes](#notas-importantes)

## Livros

A tela **Books** é a sua biblioteca. Ela lista os livros importados em formato de cartões e fornece o ponto de entrada para importar, abrir, experimentar ou excluir livros.

### O que ele faz

Cada cartão de livro mostra o título, autor, um emblema de idioma e a contagem de hashtags base. Se a biblioteca estiver vazia, a tela oferece dois pontos de partida: importar um livro ou experimentar o livro de amostra incluído, **The Keeper of the Tides**.

### O que você pode fazer

| Ação | Como funciona |
| --- | --- |
| Importar um livro | Importa um arquivo Markdown com a extensão `.md`. |
| Definir metadados opcionais | Durante a importação, você pode definir o autor e o idioma. |
| Abrir um livro | Abre o cartão do livro para gerenciar o perfil, capítulos, personagens, links, imagens e música. |
| Experimentar o livro de amostra | Importa o livro de amostra incluído, **The Keeper of the Tides**. |
| Excluir um livro | Remove um livro da biblioteca. |

### Notas

- Apenas arquivos Markdown com a extensão `.md` podem ser importados.
- O livro aparece imediatamente após a importação.
- A análise de IA é executada em segundo plano após a importação.
- A análise requer um provedor de texto configurado. Se nenhum provedor de texto estiver configurado, a análise falhará com um erro claro.
- O progresso é verificado periodicamente pelo aplicativo, e uma notificação confirma a conclusão.

## Análise do Livro e a Bíblia Visual

Depois que um livro é importado, o BookSocial Studio o analisa e constrói uma estrutura com prevenção de spoilers, usada para a geração de postagens e consistência de imagens.

### O que ele faz

A análise extrai capítulos, cria um perfil gerado por IA com sinopse, gêneros e tom, e identifica personagens. A bíblia visual é um processo em segundo plano, que pode ser retomado e faz o melhor esforço. Se uma etapa falhar, as outras etapas ainda podem ser executadas.

As etapas canônicas da bíblia visual são:

| Ordem | Etapa | Propósito |
| --- | --- | --- |
| 1 | Aparência dos personagens | Cria uma descrição física estável por personagem para obter imagens consistentes. |
| 2 | Cartões de cena dos capítulos | Cria o local, ambiente, objetos principais e secundários, personagens presentes e regras de física ou realismo para cada capítulo. Estes orientam os prompts de imagem. |
| 3 | Trajes | Cria roupas canônicas para cada personagem, com variantes para cenários recorrentes. |
| 4 | Adereços e mundo | Extrai veículos e objetos recorrentes, além do lado de direção, esquerdo ou direito, inferido a partir do livro. |
| 5 | Personagens secundários | Analisa as figuras incidentais por capítulo e atribui aparências fixas. Esta etapa é lenta. |
| 6 | Presença de personagens | Registra em quais capítulos cada personagem aparece. Isso é usado para filtrar a geração de imagens por personagem. |

### O que você pode fazer

| Ação | Onde | Resultado |
| --- | --- | --- |
| Acompanhar o progresso da importação | Modal de importação | Mostra as três etapas da importação: Ler, Analisar, Salvar. |
| Revisar o status da bíblia visual | Painel da bíblia visual na tela do livro | Mostra cada etapa como pendente, em execução, concluída ou com falha, com um contador de concluído/total. |
| Construir toda a bíblia visual | Painel da bíblia visual | Executa todas as etapas da bíblia visual. |
| Executar uma etapa | Painel da bíblia visual | Executa apenas a etapa selecionada da bíblia visual. |

### Notas

- A bíblia visual é construída em segundo plano.
- O processo pode ser retomado e é baseado no melhor esforço.
- Uma falha em uma etapa da bíblia visual não bloqueia as demais.
- A etapa de presença de personagens é usada posteriormente na escolha de personagens para a geração de imagens.

## Detalhes do Livro

A tela de detalhes do livro é onde você gerencia os dados operacionais de um livro. Ela possui seis guias: **Profile**, **Chapters**, **Characters**, **Links**, **Images** e **Music**.

### O que ele faz

Esta tela permite que você edite os dados do livro que controlam a geração de conteúdo: título, autor, hashtags, direções visuais, Páginas associadas, capítulos, personagens, links do livro, imagens geradas e dados do livro relacionados a música.

### O que você pode fazer

| Guia | Ações |
| --- | --- |
| Profile | Renomear título e autor; editar hashtags base; configurar diretivas visuais; editar adereços e mundo; revisar personagens secundários; associar o livro às Páginas conectadas. |
| Chapters | Incluir ou excluir capítulos; editar cartões de cena; regenerar cartões de cena; salvar alterações no cartão de cena. |
| Characters | Adicionar, editar e excluir personagens; gerar aparências; gerar trajes; editar a presença nos capítulos. |
| Links | Adicionar, editar e excluir links do livro. |
| Images | Gerar imagens de cena; visualizar imagens em uma caixa de luz; regenerar imagens; enviar imagens manualmente; regenerar imagens selecionadas em lote. |
| Music | Acessar a guia de Música do livro. |

### Guia Profile

A guia **Profile** controla as configurações no nível do livro que se aplicam a todo o conteúdo gerado.

| Campo ou área | O que significa | Editável |
| --- | --- | --- |
| Título | Título do livro. | Sim |
| Autor | Autor do livro. | Sim |
| Perfil gerado por IA | Sinopse, gêneros e tom. | Não |
| Emblema antiespoiler | Indica que o comportamento de prevenção de spoilers está ativo. | Não |
| Hashtags base | Hashtags aplicadas a todas as postagens do livro. | Sim |
| Domínios visuais | Alternâncias de diretivas visuais predefinidas por livro. | Sim |
| Direções de arte em texto livre | Instruções visuais adicionais, traduzidas automaticamente para o inglês para prompts de imagem. | Sim |
| Adereços e mundo | País, lado de direção e lista de objetos recorrentes. | Sim |
| Personagens secundários | Lista de figuras incidentais da bíblia visual. | Sim |
| Páginas associadas | Páginas conectadas vinculadas a este livro. | Sim |

A geração é sempre direcionada a uma Página associada, então vincule o livro às Páginas que deseja utilizar para a geração de conteúdo.

### Guia Chapters

A guia **Chapters** controla a disponibilidade no nível do capítulo e os dados dos prompts de imagem.

| Ação | Resultado |
| --- | --- |
| Incluir um capítulo | Permite que o capítulo seja usado em lotes de imagens. |
| Excluir um capítulo | Ignora o capítulo em lotes de imagens. |
| Editar um cartão de cena | Altera localização, ambiente, objetos, personagens ou regras de física. |
| Regenerar um cartão de cena | Recria o cartão de cena do capítulo. |
| Salvar um cartão de cena | Armazena suas edições. |

### Guia Characters

A guia **Characters** controla as informações do elenco e a consistência visual.

| Campo ou ação | Propósito |
| --- | --- |
| Nome | Nome do personagem. |
| Papel | Papel no livro. |
| Trabalho | Trabalho do personagem. |
| Personagem | Descrição do personagem. |
| Aparência física | Aparência estável usada para consistência da imagem. |
| Notas | Notas adicionais do personagem. |
| Trajes por contexto | Definições de roupas para cenários recorrentes. |
| Gerar aparências | Cria ou atualiza as descrições da aparência dos personagens. |
| Gerar trajes | Cria ou atualiza as definições de trajes. |
| Presença | Lista editável de capítulos em que o personagem aparece; alterne por capítulo. Determina quais personagens podem ser selecionados ao gerar imagens. |

### Guia Links

A guia **Links** armazena links de livros que podem ser usados por canal e por política.

| Campo | Significado |
| --- | --- |
| Tipo de canal | O canal a que o link se destina. |
| Política de uso | Como o link deve ser usado. |
| URL | O destino do link. |
| Rótulo | Rótulo de link legível para humanos. |
| Sinalizador padrão | Marca um link como o padrão. |

### Guia Images

A guia **Images** gerencia as imagens de cena geradas e enviadas.

| Ação | Detalhes |
| --- | --- |
| Gerar imagens de cena | Escolha a quantidade por capítulo, a proporção, os capítulos, os personagens opcionais e as configurações de flashback opcionais. |
| Deixar capítulos vazios | Usa uma distribuição automática com prevenção de spoilers. |
| Destacar personagens | Escolha opcionalmente os personagens a incluir. |
| Usar flashback | Solicite opcionalmente uma idade mais jovem e trajes de época para esse lote. |
| Acompanhar geração | Observe o contador ao vivo e o cronômetro de cada imagem. |
| Adicionar lotes à fila | Adicione lotes de geração adicionais. |
| Cancelar geração | Interrompa um lote em execução ou na fila. |
| Abrir lightbox | Visualize a imagem em tamanho real e seus metadados. |
| Regenerar | Regenere a imagem selecionada. |
| Regenerar com alterações | Adicione instruções extras ou configurações de flashback. |
| Regenerar do capítulo | Escolha os personagens do elenco do capítulo. |
| Regenerar em lote | Regenere nas imagens selecionadas. |
| Enviar manualmente | Adicione sua própria imagem à biblioteca. |

O visualizador de imagens mostra metadados: capítulo ou capítulos de origem, personagens, prompt, carimbo de data/hora e nota de catálogo.

### Notas

- A geração de imagens de cena ocorre em série: uma imagem por vez em uma única GPU.
- A publicação de um rascunho pode depender de um recurso visual pronto. Rascunhos cujos recursos visuais ainda estão em renderização não podem ser publicados até que estejam prontos.
- Hashtags base aplicam-se a todas as postagens do livro.
- As diretivas visuais são traduzidas automaticamente para o inglês para prompts de imagem.

## Conexão

A tela **Connection** conecta o BookSocial Studio às Páginas do Facebook utilizando um token de Página de Usuário do Sistema da Meta.

### O que ele faz

Ele armazena os tokens de Página criptografados no `secrets.enc` e permite escolher quais Páginas o aplicativo deve gerenciar. Os tokens nunca são armazenados no banco de dados.

### O que você pode fazer

| Ação | Resultado |
| --- | --- |
| Colar um token de acesso de Página | Inicia o fluxo de conexão. |
| Conectar | O aplicativo lista as Páginas gerenciadas por esse token. |
| Selecionar Páginas | Escolhe quais Páginas o BookSocial Studio deve gerenciar. |
| Salvar | Armazena as conexões de Página selecionadas. |
| Revisar Páginas conectadas | Cada Página salva exibe um emblema **Connected**. |
| Remover uma Página | Remove uma Página salva do aplicativo. |
| Desconectar tudo | Limpa os tokens do armazenamento criptografado. |

### Notas

- Ao salvar, o aplicativo detecta automaticamente a conta do Instagram Business vinculada a cada Página por meio do campo `instagram_business_account`.
- Se a conta do Instagram não for encontrada imediatamente, ela será resolvida de forma preguiçosa posteriormente.
- A aba do Instagram no gerenciamento da Página aparece apenas quando a Página possui uma conta vinculada do Instagram Business.
- Para obter os detalhes de configuração do Instagram, consulte [INSTAGRAM.md](./INSTAGRAM.md).

## Gerenciamento da Página

A tela **Page management** é onde você opera as Páginas conectadas após a configuração. Ela possui guias das plataformas na parte superior.

### O que ele faz

A tela permite que você gerencie conteúdo publicado no Facebook, comentários, conteúdo programado de forma nativa no Facebook, configurações da Página, comentários de mídia do Instagram, trabalhos internos agendados do Instagram e informações da conta do Instagram.

A aba da plataforma **Facebook** está sempre disponível. A aba da plataforma **Instagram** aparece apenas se a Página selecionada tiver uma conta vinculada do Instagram Business.

### O que você pode fazer

| Plataforma | Área | Ações |
| --- | --- | --- |
| Facebook | Postagens e comentários | Revisar postagens publicadas, editar texto, fixar ou desafixar, visualizar e gerenciar comentários, excluir postagens. |
| Facebook | Gaveta de criação de postagem | Publicar agora ou programar uma postagem nativa no Facebook com texto, link opcional e data opcional. |
| Facebook | Programado no Facebook | Visualizar conteúdo programado nativamente no Facebook. |
| Facebook | Configurações da Página | Editar o sobre ou a descrição, site, contato e imagem de capa, depois salvar no Facebook. |
| Instagram | Postagens e comentários | Revisar Reels, Postagens e Stories publicados com contagem de curtidas e comentários; gerenciar comentários. |
| Instagram | Programados | Revisar trabalhos internos pendentes do Instagram vinculados aos Reels ou Stories programados no Facebook. |
| Instagram | Conta | Visualizar as informações do perfil. |

### Facebook: Postagens e Comentários

A subguia **Posts & comments** lista as postagens publicadas no Facebook com miniatura, data, trecho e emblemas como **pinned** ou **not published**.

| Ação | Resultado |
| --- | --- |
| Editar texto | Atualiza o texto da postagem. |
| Fixar ou desafixar | Altera se a postagem está fixada ou não. |
| Visualizar comentários | Abre o gerenciamento de comentários para a postagem. |
| Responder | Adiciona uma resposta aninhada ao comentário. |
| Ocultar ou mostrar | Altera a visibilidade do comentário. |
| Curtir | Curte um comentário. |
| Excluir comentário | Exclui um comentário. |
| Excluir postagem | Exclui a postagem. |

A gaveta **Create post** inclui uma prévia em tempo real com estilo do Facebook e exige confirmação explícita. Se a data estiver vazia, a postagem será publicada imediatamente. Se for informada uma data, ela será programada nativamente no Facebook.

### Facebook: Programado no Facebook

Esta subguia mostra o conteúdo programado nativamente no Facebook.

### Facebook: Configurações da Página

Esta subguia permite editar os campos da Página e salvá-los no Facebook.

| Campo | Resultado |
| --- | --- |
| Sobre ou descrição | Atualiza o campo de texto da Página. |
| Site | Atualiza o site da Página. |
| Contato | Atualiza as informações de contato da Página. |
| Imagem de capa | Atualiza a imagem de capa da Página. |

### Instagram: Postagens e Comentários

A subguia de mídia do Instagram exibe os Reels, Postagens e Stories publicados com suas contagens de curtidas e comentários.

| Ação | Resultado |
| --- | --- |
| Expandir um item de mídia | Abre seus comentários. |
| Responder | Adiciona uma resposta aninhada ao comentário. |
| Ocultar comentário | Oculta um comentário. |
| Excluir comentário | Exclui um comentário. |

### Instagram: Programados

Esta subguia mostra os trabalhos internos pendentes do Instagram. Estes são os trabalhos gêmeos de Reels ou Stories programados do Facebook.

### Instagram: Conta

Esta subguia mostra as informações do perfil do Instagram.

| Campo | Editável no BookSocial Studio |
| --- | --- |
| Nome de usuário | Não |
| Bio | Não |
| Contagem de seguidores | Não |
| Contagem de pessoas que segue | Não |
| Contagem de mídia | Não |
| Foto | Não |

### Notas

- O conteúdo programado no Facebook mostrado na aba **Scheduled on Facebook** é somente leitura aqui e deve ser gerenciado no próprio Facebook.
- Os campos do perfil do Instagram são somente leitura pela API. Altere-os no aplicativo do Instagram.
- O painel do Instagram aparece apenas quando a Página selecionada possui uma conta vinculada do Instagram Business.

## Planejador

A tela **Planner** cria um período típico de uma semana, um mês ou um intervalo personalizado de conteúdo social para uma Página e um Livro selecionados.

### O que ele faz

Ele utiliza cotas, janelas de tempo, o livro selecionado e a Página escolhida para gerar rascunhos de forma assíncrona. O aplicativo seleciona dias, horários e formatos, evita duplicações e renderiza elementos visuais em segundo plano.

### O que você pode fazer

| Ação | Detalhes |
| --- | --- |
| Escolher uma Página | Selecione a Página conectada para gerar o conteúdo. |
| Escolher um Livro | Selecione o livro associado a partir do qual gerar o conteúdo. |
| Definir cotas | Escolha quantas postagens, reels e stories gerar no período escolhido (total, não por semana). |
| Definir janelas de tempo | Adicione um horário ou um intervalo de tempo por dia da semana. |
| Remover janelas de tempo | Remova as janelas de tempo individualmente. |
| Escolher um período | Selecione a semana, o mês ou um intervalo de datas personalizado. |
| Gerar | Inicie um trabalho assíncrono no servidor que cria os rascunhos e renderiza os elementos visuais. |
| Acompanhar progresso | Siga o progresso ao vivo no formato `N/M`. |
| Cancelar | Interrompa o trabalho de geração. Os rascunhos criados serão mantidos. |

### Períodos

| Período | Duração |
| --- | --- |
| Semana | 7 dias; padrão. |
| Mês | 28 dias. |
| Intervalo personalizado | Intervalo de datas selecionado pelo usuário. |

### Janelas de Tempo

| Tipo de janela | Comportamento |
| --- | --- |
| Horário único | Publicar dentro de cerca de 30 minutos. |
| Intervalo de tempo | O motor escolhe um horário dentro do intervalo. |
| Sem janelas | Os padrões são aplicados. |

### Lista de Rascunhos Gerados

Cada cartão de rascunho gerado mostra o tipo, o ângulo, o formato, o status, o horário programado e uma visualização no estilo do Facebook. A visualização inclui um detalhamento das hashtags: base, específicas e finais.

| Ação de rascunho | Resultado |
| --- | --- |
| Editar | Altera o texto, as hashtags e a data/hora. |
| Regenerar | Cria um novo texto e novas hashtags, e renderiza o recurso visual novamente. O aplicativo faz consultas até que esteja pronto. |
| Excluir | Remove o rascunho. |
| Publicar agora | Publica imediatamente após a confirmação explícita. |
| Programar publicação | Converte todos os rascunhos com datas futuras em itens programados, após a confirmação. |

### Notas

- Reels e Stories são vídeos verticais em 9:16.
- Postagens são conteúdo de texto/foto.
- Rascunhos cujos recursos visuais ainda estão sendo renderizados exibem um espaço reservado.
- O botão **Publish now** fica desativado até que o recurso visual do rascunho esteja pronto.
- No agendamento em massa, as postagens do Facebook são agendadas nativamente na rede e podem ser publicadas mesmo se o aplicativo estiver desligado.
- Reels e Stories são agendados através do programador interno, portanto o servidor deve estar ligado no momento agendado.

## Programados

A tela **Scheduled** exibe a fila de publicação interna.

### O que ele faz

Ele lista os Reels e os Stories que o servidor do BookSocial Studio publicará de forma automática em seus horários programados.

### O que você pode fazer

| Ação | Disponibilidade | Resultado |
| --- | --- | --- |
| Publicar agora | Por item, com confirmação | Publica imediatamente o item na fila. |
| Remover | Por item, se ainda não estiver publicado | Remove o item da fila interna. |
| Publicar também no Instagram | Somente Reels e Stories do Facebook, vídeo em 9:16 | Cria um trabalho gêmeo no Instagram no mesmo horário e vinculado ao item do Facebook. |
| Remover gêmeo do Instagram | Itens com um trabalho gêmeo no Instagram | Remove o trabalho vinculado do Instagram. |

### Notas

- Um banner proeminente alerta que o servidor deve estar em execução no horário programado.
- Se o servidor não estiver em execução, os trabalhos de Reels, Stories e Instagram não serão enviados.
- Postagens nativas do Facebook não são processadas por esta fila e são publicadas de forma independente no Facebook.
- Quando um item do Facebook com um gêmeo no Instagram é publicado, o servidor também o publica no Instagram com a mesma legenda.

## Métricas

A tela **Insights** o ajuda a revisar o desempenho da Página e da conta.

### O que ele faz

Você escolhe uma Página e um período e, em seguida, analisa as métricas do Facebook e, se vinculadas, as métricas do Instagram.

### O que você pode fazer

| Ação | Detalhes |
| --- | --- |
| Escolher uma Página | Use as abas da Página. |
| Escolher um período | Escolha dia, semana ou mês. |
| Ver métricas do Facebook | Disponível para as Páginas do Facebook conectadas. |
| Ver métricas do Instagram | Disponível quando a Página possui uma conta do Instagram Business vinculada. |
| Comparar Páginas | Disponível quando há duas ou mais Páginas conectadas. |

### Métricas do Facebook

| Área | O que mostra |
| --- | --- |
| Painéis de KPIs | Seguidores, curtidas/fãs, alcance, engajamento. |
| Gráfico de tendência de seguidores | Ganhos em verde, perdas em vermelho e total líquido. |
| Postagens principais | Top 10 por engajamento, com visualizações, alcance, reações, comentários, compartilhamentos e um link para o Facebook. |
| Gráfico de linha temporal | Alcance e seguidores ao longo do tempo. |
| Minigráfico de cobertura | Tendência de cobertura. |
| Demografia | Principais países, cidades e gênero-idade. |
| Tabela de comparação de Páginas | Comparação entre Páginas quando duas ou mais Páginas estão conectadas. |

### Métricas do Instagram

| Área | O que mostra |
| --- | --- |
| KPIs da conta | Seguidores, quem a conta segue e total de mídias. |
| Métricas da conta no período | Alcance, visualizações do perfil e total de seguidores. |

### Notas

- Na tabela de comparação de Páginas, cada célula carrega de forma independente.
- Se ocorrer uma falha ao carregar uma Página na tabela de comparação, a célula daquela Página exibirá `—`.
- Algumas métricas do Instagram podem não estar disponíveis, dependendo da conta ou da versão da API. O aplicativo lida com essa falha de forma elegante.

## Configurações: IA

A tela **Settings** configura o provedor de texto da IA, o provedor de imagem, o modo de imagem e a checagem de qualidade (QA) de imagem opcional.

### O que ele faz

O BookSocial Studio usa um provedor de texto conectável para análise e redação, e um provedor de imagem conectável para a criação de cenários visuais. Você configura os dois nesta tela.

### O que você pode fazer

| Ação | Resultado |
| --- | --- |
| Configurar provedor de texto | Ativa a análise do livro, redação de postagens, geração de hashtags e tarefas de texto relacionadas. |
| Configurar provedor de imagem | Ativa a geração de imagens de cena e os recursos visuais gerados para os rascunhos. |
| Testar conexão de texto | Retorna uma mensagem de sucesso com uma amostra ou um erro claro. |
| Testar conexão de imagem | Retorna uma mensagem de sucesso com uma amostra ou um erro claro. |
| Escolher modo de imagem | Selecione Library ou Direct. |
| Ativar o QA de imagens | Valida as imagens geradas e regenera as imagens reprovadas, utilizando recuo exponencial. |

### Provedores de Texto

Existem duas famílias de provedores de texto.

| Família | Provedores | Autenticação e configuração |
| --- | --- | --- |
| Assinatura via CLI | opencode, codex (ChatGPT), gemini (Google) | Nenhuma chave de API é armazenada no aplicativo. O painel exibe o status de instalação da CLI, um botão **Authenticate** que inicia o login da CLI e um botão **Verify** que verifica o status novamente. Há um campo opcional de nome do modelo para a CLI. |
| Chave de API | OpenAI e endpoints compatíveis com a OpenAI, Anthropic, Google, Ollama | Insira a chave da API, opcionalmente defina uma URL base e escolha o modelo em uma lista carregada através de **Load models**, com substituição manual. O Ollama é local e não requer o uso de uma chave. |

Para provedores de chave de API, as chaves são armazenadas criptografadas no arquivo `secrets.enc`. Uma chave digitada uma vez para um provedor é reutilizada, por exemplo, para imagens do mesmo provedor, e é exibida como já definida.

Quando for necessário o nome de um modelo específico, insira o modelo que você escolheu / o nome do modelo do seu provedor.

### Provedores de Imagem

| Opção do provedor | Significado |
| --- | --- |
| local | Usa um motor no dispositivo. Consulte [TESTED-ON.md](./TESTED-ON.md). |
| auto | Usa a versão local, se disponível; caso contrário, nenhuma. |
| none | Desativa imagens geradas; utilize apenas a opção de upload. |
| OpenAI | Provedor de imagem na nuvem; reutiliza a chave de texto compartilhada. |
| Google | Provedor de imagem na nuvem; reutiliza a chave de texto compartilhada. |
| Stability | Provedor de imagem na nuvem com chave própria. |
| Black Forest Labs (FLUX) | Provedor de imagem na nuvem com chave própria. |
| Replicate | Provedor de imagem na nuvem com chave própria. |
| fal.ai | Provedor de imagem na nuvem com chave própria. |

O campo de modelo de imagem é de texto livre. Digite o modelo que você escolheu / o nome do modelo do seu provedor. Não há nenhum modelo de imagem pré-definido.

### Modo de Imagem

| Modo | Comportamento |
| --- | --- |
| Library | Imagens geradas vão para uma biblioteca reutilizável e você escolhe imagens para cada rascunho. |
| Direct | O recurso visual é renderizado diretamente nos rascunhos durante a geração da semana. Isso requer um motor de imagens funcional. |

### QA de Imagens

Quando a QA de imagens está ativada, cada imagem gerada é validada e regenerada caso seja reprovada na verificação. As tentativas de repetição utilizam recuo exponencial.

### Notas

- A Anthropic está disponível como um provedor de chave de API (sem login de assinatura).
- A autenticação da assinatura via CLI reside na própria CLI; nenhum token de assinatura é armazenado no BookSocial Studio.
- Para a configuração específica do provedor, consulte [PROVIDERS.md](./PROVIDERS.md).

## Configuração da Graph API: Meta

A configuração da Meta é necessária antes de o BookSocial Studio poder gerenciar Páginas do Facebook ou contas vinculadas do Instagram Business.

### O que ele faz

A configuração da Meta fornece ao aplicativo o acesso a Páginas, postagens, comentários, métricas e publicação no Instagram, quando disponível.

### O que você pode fazer

| Área | Requisito |
| --- | --- |
| Facebook | Crie um aplicativo Meta com Login do Facebook. |
| Facebook | Crie um token de Página de Usuário do Sistema com permissões para ler e gerenciar a Página, postagens, comentários e métricas. |
| Facebook | Cole o token de Página na tela **Connection**. |
| Instagram | Adicione o produto **API do Instagram com Login do Facebook**. |
| Instagram | Inclua `instagram_basic` e `instagram_content_publish`. |
| Instagram | Vincule a conta do Instagram Business à Página do Facebook. |
| Instagram | Atribua a conta do Instagram Business ao Usuário do Sistema. |
| Instagram | Certifique-se de que o token de Página inclua os escopos do Instagram. |

As permissões do Facebook incluem exemplos como `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `pages_manage_engagement/comments` e `pages_read_user_content`.

### Notas

- O mapeamento do Instagram requer uma Página do Facebook para uma conta do Instagram Business.
- Notas detalhadas sobre o Instagram estão localizadas no arquivo [INSTAGRAM.md](./INSTAGRAM.md).

## Fluxos de Trabalho Comuns

### 1. Importar e Analisar um Livro

1. Abra a guia **Books**.
2. Escolha **Import a book**.
3. Selecione um arquivo Markdown `.md`.
4. Defina o autor e o idioma (opcional).
5. Confirme a importação.
6. Aguarde enquanto o aplicativo lê, analisa e salva o livro.
7. Abra o livro quando a notificação de conclusão for exibida.
8. Revise o perfil, capítulos, personagens e o status da bíblia visual.

### 2. Configurar a IA Antes de Importar

1. Abra a aba **Settings**.
2. Escolha um provedor de texto.
3. Faça a autenticação por meio de um provedor CLI ou informe uma chave de API, dependendo da família do provedor.
4. Se estiver usando um provedor de chave de API, clique em **Load models** ou digite manualmente o modelo escolhido / o nome do modelo de seu provedor.
5. Execute a ação **Test** de texto.
6. Escolha um provedor de imagem se quiser gerar imagens.
7. Insira o modelo de imagem que você escolheu / o nome do modelo do seu provedor, se necessário.
8. Execute a ação **Test** de imagem.
9. Escolha o modo de imagem **Library** ou **Direct**.

### 3. Conectar uma Página do Facebook

1. Abra a aba **Connection**.
2. Cole um token de acesso de Página de Usuário do Sistema da Meta.
3. Selecione **Connect**.
4. Revise as Páginas gerenciadas por esse token.
5. Selecione as Páginas que o BookSocial Studio deve gerenciar.
6. Selecione **Save**.
7. Confirme se as Páginas salvas exibem o emblema **Connected**.
8. Se a Página possuir uma conta do Instagram Business vinculada, aguarde a detecção automática ou a resolução preguiçosa.

### 4. Associar um Livro a uma Página

1. Abra a aba **Books**.
2. Abra o livro.
3. Vá para a aba **Profile**.
4. Procure a seção **Associated pages**.
5. Marque as Páginas conectadas que devem ter permissão de geração.
6. Salve as configurações do livro correspondente.

### 5. Construir ou Reparar a Bíblia Visual

1. Abra a aba **Books**.
2. Abra o livro.
3. Expanda o painel da **Visual bible**.
4. Revise o status de cada etapa e o contador de concluído/total.
5. Selecione **Build visual bible** para executar todas as etapas.
6. Ou execute uma única etapa se apenas uma área precisar de trabalho.
7. Analise as etapas com falhas sem presumir que todo o pipeline falhou, já que as etapas são de melhor esforço e independentes.

### 6. Gerar Imagens de Cena

1. Abra o livro.
2. Vá para a aba **Images**.
3. Escolha a contagem de imagens por capítulo.
4. Escolha a proporção.
5. Selecione os capítulos ou deixe o campo vazio para uma distribuição automática com prevenção de spoilers.
6. Selecione opcionalmente os personagens a serem destacados.
7. Opcionalmente, ative um flashback com uma idade mais jovem e trajes de época para o lote.
8. Inicie a geração.
9. Assista ao contador em tempo real e ao cronômetro de cada imagem.
10. Abra as imagens geradas na caixa de luz para revisar a saída em tamanho real e os metadados.

### 7. Planejar uma Semana de Conteúdo

1. Abra o **Planner**.
2. Escolha uma Página.
3. Escolha um Livro associado a essa Página.
4. Defina as cotas (total para o período escolhido) para posts, reels e stories.
5. Adicione janelas de tempo nos dias úteis ou deixe-as em branco para usar os padrões.
6. Escolha **week** como o período.
7. Selecione **Generate**.
8. Assista ao progresso de `N/M` ao vivo.
9. Verifique cada cartão de rascunho gerado.
10. Edite, regenere, exclua ou publique rascunhos, conforme a necessidade.

### 8. Programar Rascunhos Futuros

1. Gere rascunhos no **Planner**.
2. Revise os rascunhos e faça as edições.
3. Certifique-se de que os recursos visuais estejam prontos para rascunhos que exijam recursos visuais.
4. Escolha **Schedule publishing**.
5. Leia a confirmação que explica a diferença entre o agendamento nativo do Facebook e o programador interno.
6. Confirme.
7. Lembre-se de que postagens do Facebook são programadas nativamente no Facebook, enquanto que Reels e Stories necessitam que o servidor do BookSocial Studio esteja on-line no momento da publicação.

### 9. Publicar um Rascunho Imediatamente

1. Abra a guia **Planner**.
2. Encontre o cartão de rascunho.
3. Confirme que todos os visuais necessários estejam prontos.
4. Selecione **Publish now**.
5. Confirme de forma explícita.

### 10. Adicionar a Publicação no Instagram a um Reel ou Story Programado

1. Abra a guia **Scheduled**.
2. Encontre um Reel ou Story do Facebook no formato de vídeo 9:16.
3. Ative a opção **Publish also on Instagram**.
4. Verifique se um trabalho gêmeo no Instagram foi criado com a mesma data e horário.
5. Mantenha o servidor em execução no horário agendado.
6. Remova a cópia gêmea se não quiser mais que o item do Instagram seja publicado.

### 11. Gerenciar Comentários do Facebook

1. Abra a aba **Page management**.
2. Selecione a Página.
3. Abra a aba **Facebook**.
4. Abra **Posts & comments**.
5. Escolha uma postagem.
6. Visualize os comentários.
7. Responda, oculte ou mostre, curta ou exclua os comentários conforme for necessário.

### 12. Revisar o Desempenho

1. Abra a tela **Insights**.
2. Escolha uma Página.
3. Escolha o dia, semana ou mês.
4. Analise os painéis de KPIs do Facebook, gráficos, principais postagens, demografia e o histórico.
5. Se o Instagram estiver vinculado, abra a aba do Instagram.
6. Revise os KPIs da conta e as informações da conta disponíveis.
7. Se houver duas ou mais Páginas conectadas, revise a tabela de comparação de Páginas.

## Notas Importantes

### Segurança

- Os tokens do Facebook e as chaves de API da IA são armazenados de forma criptografada (AES-256-GCM) em `secrets.enc`, e nunca no banco de dados.
- A autenticação da assinatura via CLI reside na própria CLI. Nenhum token de assinatura é armazenado no BookSocial Studio.
- Utilize a tela **Connection** para desconectar as Páginas ou limpar os tokens de Página armazenados.

### Limites da Meta

- Os campos do perfil do Instagram são somente leitura por meio da API. Altere-os no aplicativo do Instagram.
- O Instagram não possui agendamento nativo neste aplicativo, então a publicação no Instagram utiliza trabalhos internos.
- Algumas métricas do Instagram são inconsistentes entre as versões da API e podem ficar indisponíveis.
- O mapeamento do Instagram corresponde a uma Página do Facebook para uma conta do Instagram Business.

### Desempenho

- A análise do livro e a geração da semana são assíncronas e mostram o progresso ao vivo.
- A geração de imagens local é a parte mais pesada do processo.
- A geração local de imagens ocorre em série, processando uma imagem por vez no dispositivo.
- Consulte [TESTED-ON.md](./TESTED-ON.md) para ver a máquina testada e as notas sobre a geração de imagens locais.

### O Servidor Deve Permanecer Ligado

- O programador interno deve estar em execução no horário programado para Reels, Stories e itens do Instagram.
- Se o servidor estiver desligado no horário agendado, esses itens programados internamente não serão enviados.
- Postagens nativas do Facebook são publicadas de forma independente, pois são agendadas diretamente no Facebook.
