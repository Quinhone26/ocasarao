# Corrigir o carregamento do cardápio

## Diagnóstico confirmado
- A tela mostra a orientação de executar a migração para qualquer falha ao consultar os produtos, mesmo quando a causa é outra.
- A tentativa de consulta pela conexão configurada falhou na conexão. Ainda não foi possível confirmar se a tabela `produtos` existe ou se há um problema de permissões.

## Correção proposta
1. Verificar a conexão usada pelo aplicativo e identificar o erro real na consulta dos produtos.
2. Corrigir a conexão, caso esteja incorreta ou indisponível. Se for necessário conectar o serviço pelo Lovable, solicitar a autorização correspondente antes de prosseguir.
3. Se a tabela estiver ausente, aplicar a estrutura necessária para o cardápio, preservando os dados existentes. Se a falha for de acesso, corrigir somente as permissões necessárias, sem liberar edição pública dos produtos.
4. Substituir a mensagem que manda executar um arquivo por um aviso compreensível, correspondente à falha, com opção de tentar novamente.
5. Validar que os produtos carregam no painel e no pedido público; verificar cadastro e edição de um produto quando houver acesso ao painel.

## Detalhes técnicos
- Conferir a configuração do cliente e a resposta da consulta à tabela `produtos` antes de decidir por uma migração.
- O SQL pendente permite escrita anônima nos produtos; não aplicar essa liberação irrestrita como solução para um erro de leitura.
- Manter a proteção atual do painel e não modificar entregas, preços ou produtos existentes.