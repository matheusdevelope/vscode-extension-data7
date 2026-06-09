' @example: diagnostics/declaration-parentheses-mismatch/trigger
' @demonstrates: method declaration missing parentheses
' @diagnostics: declaration-parentheses-mismatch@8
'
Namespace mod_test
   Class C
      Shared Function BandeiraProduto As TObject
         BandeiraProduto = Nothing
      End Function
   End Class
End Namespace
