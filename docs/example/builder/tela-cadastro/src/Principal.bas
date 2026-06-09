' @example: builder/tela-cadastro/src/Principal
' @demonstrates: entrada do projeto — importa o módulo de tela, instancia, exibe e libera o formulário
' @diagnostics: none
' @requires: projeto tela-cadastro (indexado junto com mod_form_cliente.bas)
'
Imports mod_form_cliente

Dim _form As New TFormCliente("Cadastro de Cliente")
_form.Show()
_form.Free()
