' @example: diagnostics/unused-code/trigger
' @demonstrates: classe de namespace sem uso a partir de Principal.Main
' @diagnostics: unused-code@13
'
Namespace mod_principal
   Class Program
      Public Sub Main()
      End Sub
   End Class
End Namespace

Namespace mod_orphan
   Class DeadClass
   End Class
End Namespace
