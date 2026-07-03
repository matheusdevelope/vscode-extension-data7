' @example: diagnostics/abstract-instantiation/trigger
' @demonstrates: classe MustInherit nao pode ser instanciada diretamente
' @diagnostics: abstract-instantiation@12
'
MustInherit Class AbstractDemo
   Sub New()
      MyBase.New()
   End Sub
End Class

Dim demo As New AbstractDemo()
