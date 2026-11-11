# Contexto do domínio

## Reserva

Uma reserva representa o compromisso confirmado de um cliente com uma aula em um horário específico.

Uma reserva só existe quando a disponibilidade atual da aula foi validada e o compromisso foi confirmado pelo sistema.

## Disponibilidade

Disponibilidade é a quantidade de vagas que ainda podem ser ocupadas em uma aula. A disponibilidade exibida ao usuário é informativa; a confirmação depende da situação atual no momento da reserva.

## Conflito de reserva

Conflito de reserva ocorre quando a aula não possui mais disponibilidade ou quando a solicitação viola outra regra vigente de agenda. O sistema deve recusar a operação e informar o motivo correspondente.

## Solicitação repetida

Uma solicitação repetida para a mesma intenção de reserva não deve criar um novo compromisso. Deve preservar o resultado da solicitação original.

## Manifestação

Manifestação registra uma ação de um usuário sobre um documento ou consentimento. Cada evento é imutável e informa usuário, tipo, versão aplicável, ação concedida ou revogada e data. Ciência da política de privacidade, aceite dos termos de uso e consentimento de ranking são tipos distintos; uma nova ação acrescenta outro evento, sem substituir o anterior.

## Pedido

Pedido é a reserva de produtos da loja feita pelo cliente, sem pagamento no app. Ao ser criado, separa as unidades no estoque e fica aguardando aprovação da equipe; pode ser aprovado, recusado, cancelado pelo cliente (só enquanto aguarda) ou entregue. Não confundir com **Reserva**, que é sempre de aula. Os itens do pedido guardam nome e preço do momento do pedido.

## Produto, opção e variação

Produto é um item à venda na loja, com até 5 fotos e uma categoria opcional. Opção é uma característica livre do produto (Cor, Tamanho, Modelo) com seus valores; variação é uma combinação de valores das opções, com estoque próprio e preço próprio opcional. Produto em **destaque no Início** aparece no atalho da loja (no máximo 3). Excluir produto é sempre lógico.

## Avaliação de bioimpedância

Avaliação de bioimpedância é o registro dos valores de um laudo InBody de um cliente numa data e hora. Cada valor é uma **medida**, com unidade e, quando houver, faixa de referência e classificação (Abaixo, Normal, Acima). O **gabarito do laudo** é o mapa das áreas de cada medida no layout do InBody120, usado para ler a foto do laudo. A imagem não é guardada. Registrar exige o **consentimento de bioimpedância** do cliente, uma manifestação própria.

