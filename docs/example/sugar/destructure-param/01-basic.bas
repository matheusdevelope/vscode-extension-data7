' @example: sugar/destructure-param/01-basic
' @demonstrates: convenção atual: declarar Dims no início do corpo manualmente
' @diagnostics: none
'
' O destructuring em parâmetro (`Sub Foo({ Nome, Idade } As Pessoa)`)
' ainda é exploratório. A convenção atual é receber o objeto e declarar
' os Dims no início do corpo:
'
Namespace mod_demo
   Class TDemo
      Public Sub Greet(pPessoa As TPessoa)
         Dim Nome As String = pPessoa.Nome
         Dim Idade As Integer = pPessoa.Idade
         Print Nome & " " & Idade
      End Sub
   End Class
End Namespace
