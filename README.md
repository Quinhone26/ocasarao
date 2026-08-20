# MotoEntrega Express

Crie um aplicativo mobile-first para gestão de entregas de motoboy.



Objetivo:

Permitir cadastrar entregas, abrir a rota automaticamente no Google Maps, controlar status das entregas e gerenciar pedidos.



Tela Principal:



Dashboard com quantidade de entregas pendentes, em rota e entregues.



Lista de entregas em formato de cards.



Campo de busca por cliente, telefone ou endereço.



Cadastro de Entrega:



Nome do cliente



Telefone



Endereço completo



Número



Bairro



Cidade



Complemento



Observações



Valor da entrega



Data e hora



Cada entrega deve possuir:



Botão "Navegar"



Botão "Editar"



Botão "Excluir"



Botão "Marcar como Entregue"



Ao clicar em "Navegar":



Abrir automaticamente o Google Maps utilizando o endereço cadastrado.



Funcionar em Android e iPhone.



Status disponíveis:



Pendente



Em Rota



Entregue



Cancelada



Cores dos status:



Vermelho para Pendente



Amarelo para Em Rota



Verde para Entregue



Cinza para Cancelada



Filtros:



Todas



Pendentes



Em Rota



Entregues



Canceladas



Relatórios:



Total de entregas do dia



Total entregues



Total pendentes



Taxa de conclusão



Banco de dados:



Supabase



Autenticação:



Login por e-mail e senha.



Requisitos:



Interface moderna



Mobile First



Botões grandes para uso durante o trabalho



Atualização em tempo real



Design profissional semelhante a aplicativos de logística.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ocasarao.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9517021b-40f1-45d6-afe1-04c6d0bcf1b4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
