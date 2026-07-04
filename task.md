# Tarefa: Correções do Linter — Principal.bas

## Investigação (concluída)

- [x] Q1: `Function` sem `As` → parser grava `returnType = undefined`; token `Function` vs `Sub` é a distinção
- [x] Q2: Encadeamento `New T().Membro` → deve gerar erro
- [x] Q3: Arquivo .bas já corrigido pelo usuário
- [x] Q4: Construtores → indexados como `kind: "method"` com `name: "New"`, sem campo `isConstructor` no `SymbolInfo`
- [x] Bug Categoria 6: `resolveIdentifierType` retorna o nome da classe como tipo; `isStaticAccess` nunca fica `true` pelo path do tipo-resolver

## Implementação

### Categoria 1 — Tipo obrigatório em Property/Function/Shared Function

- [ ] Adicionar código `MissingReturnType: "missing-return-type"` em `diagnostic-codes.ts`
- [ ] Adicionar interface `MissingReturnTypePayload` em `diagnostic-codes.ts`
- [ ] Adicionar `MissingReturnTypePayload` na union `DiagnosticPayload`
- [ ] Em `control-flow-rule.ts`: verificar linha source para token `Function` e emitir erro se `returnType === undefined`
- [ ] Em `types-rule.ts`: verificar `PropertyDeclaration.type.name === ""` (empty) e emitir erro

### Categoria 3 — Encadeamento na instanciação (New T().Membro)

- [ ] Em `members-rule.ts`: nos handlers de `MemberAccess` e `MethodInvocation`, verificar se `node.target`/`node.callee` é `ObjectCreationExpression` e emitir erro `ChainedInstantiationAccess`
- [ ] Em `control-flow-rule.ts`: verificar `ExpressionStatement` com `ObjectCreationExpression.MemberAccess/MethodInvocation`
- [ ] Adicionar código `ChainedInstantiationAccess: "chained-instantiation-access"` em `diagnostic-codes.ts`

### Categoria 5 — Identificador de membro de classe no escopo global

- [ ] Investigar por que `PropertyDeExemplo` e `FunctionAsIntegerDeExemplo` sem `()` não geram `UnknownSymbol`

### Categoria 6 — Fix: acesso estático de membro não-Shared via nome do tipo

- [ ] Em `members-rule.ts`: no `checkMemberAccess` e `checkMethodInvocation`, após `resolveExpressionType`, verificar adicionalmente se o receiver é um `Identifier` que resolve para um símbolo de classe — se sim, marcar `isStaticAccess = true`

### Categoria 7 — Instanciação sem args / aridade de métodos

- [ ] Em `types-rule.ts`: em `checkObjectCreationExpression`, buscar construtores (`kind === "method"`, `name.toLowerCase() === "new"`) da classe e verificar aridade
- [ ] Emitir `AutoNewNonDefaultCtor` quando nenhum construtor aceita os args fornecidos

### Testes

- [ ] Adicionar testes de regressão em `diagnostics.test.ts`

### Finalização

- [ ] `npm run format`
- [ ] `npm run verify`
