' @example: diagnostics/destructure-non-array/trigger
' @demonstrates: destructure array [a, b] aplicado a tipo não indexável
' @diagnostics: destructure-non-array@6
' @requires: classe TPessoa sem Item(Integer) no workspace
'
Namespace mod_demo
   Sub Run(pPessoa As TPessoa)
      Dim [a, b] = pPessoa
   End Sub
End Namespace
