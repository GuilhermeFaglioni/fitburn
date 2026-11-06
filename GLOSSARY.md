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
