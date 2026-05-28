' @example: diagnostics/lambda-capture-unsupported/trigger
' @demonstrates: lambda referencia variável local — captura não suportada em Data7
' @diagnostics: lambda-capture-unsupported@7
' @requires: emissão futura do linter quando lambdas inline forem implementados (H3)
'
Namespace mod_demo
   Sub Run(lista As CardRecordList)
      Dim limite As Integer = 100
      Dim filtrados = lista.Filter((item, i, x) => item.Valor > limite)
   End Sub
End Namespace
