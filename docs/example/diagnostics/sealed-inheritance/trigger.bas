' @example: diagnostics/sealed-inheritance/trigger
' @demonstrates: classe NotInheritable nao pode ser herdada
' @diagnostics: sealed-inheritance@12
'
NotInheritable Class FinalDemo
   Sub New()
      MyBase.New()
   End Sub
End Class

Class ChildDemo
   Inherits FinalDemo
End Class
