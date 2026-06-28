' @example: diagnostics/shared-return-global-function/trigger
' @demonstrates: shared-return-global-function warning when shared function return variable is assigned directly from global function
' @diagnostics: shared-return-global-function@9
' @requires: linter implementation for shared return global function detection
'
Namespace mod_test
   Function GlobalFunc() As String
      GlobalFunc = "global"
   End Function

   Class C
      Public Shared Function Run() As String
         Run = GlobalFunc()
      End Function
   End Class
End Namespace
