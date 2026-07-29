' @example: diagnostics/unused-code/ok-reachable
' @demonstrates: classe usada a partir de Principal.Main não gera unused-code
' @diagnostics: none
'
Imports mod_helper
Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim helper As THelper = New THelper()
         helper.Touch()
      End Sub
   End Class
End Namespace

Namespace mod_helper
   Class THelper
      Public Sub New()
      End Sub

      Public Sub Touch()
      End Sub
   End Class
End Namespace
