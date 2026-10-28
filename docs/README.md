# Central de documentação — Sistema de Acionamento

> Atualizado em 28/10/2026. Documentação técnica, funcional e operacional do sistema em produção.

## Por onde começar

- [[01-visao-geral]] — objetivo, público e módulos do sistema.
- [[02-o-que-ja-foi-feito]] — entregas disponíveis e situação atual.
- [[03-regras-operacionais]] — regras confirmadas com a operação.
- [[04-pendencias-e-roadmap]] — o que falta, prioridades e critérios de conclusão.
- [[05-roteiro-apresentacao]] — estrutura sugerida para apresentar o projeto à chefia.
- [[06-manual-rapido-operador]] — instruções de uma página para o teste no serviço.

## Estado resumido

O sistema está em produção em [sistema-acionamento.vercel.app](https://sistema-acionamento.vercel.app/), com banco no Supabase e integração SIGhRA por uma ponte instalada na rede da empresa.

## Documentos técnicos existentes

- [API de consulta para dashboard](API_DASHBOARD.md)

- [Arquitetura atual](ARQUITETURA.md)
- [Documentação técnica e funcional](DOCUMENTACAO_SISTEMA.md)
- [Regras de negócio completas](REGRAS_NEGOCIO.md)
- [Operação e recuperação](OPERACAO_E_RECUPERACAO.md)
- [Ponte SIGhRA](PONTE_SIGHRA.md)
- [Mapeamento original do Excel](MAPEAMENTO_EXCEL.md)
- [Roadmap técnico original](archive/ROADMAP_ORIGINAL.md)
- [Ponto de restauração histórico](archive/BACKUP_INFO_2026-09-20.md)

## Organização

Arquivos em `archive/` registram decisões ou pontos de restauração históricos e não descrevem necessariamente o estado atual da produção. O `README.md` da raiz e `ARQUITETURA.md` são os pontos de entrada para revisão técnica.
