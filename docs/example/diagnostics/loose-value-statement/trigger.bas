' @example: diagnostics/loose-value-statement/trigger
' @demonstrates: propriedade usada como instrucao solta
' @diagnostics: loose-value-statement@9
'
Imports Forms

Sub Run(pItem As TObject)
   Form(pItem).Margins.Bottom
End Sub
