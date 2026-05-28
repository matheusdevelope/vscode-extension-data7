' @example: sugar/cast-function/01-ctype-canonical
' @demonstrates: forma canônica de cast no Data7 — CType(expr, T)
' @diagnostics: none
'
' A forma açucarada `T(expr)` (estilo VB) ainda NÃO é transpilada porque a
' heurística de detecção precisa distinguir `Product(x)` (cast) de `Trim(x)`
' (chamada de função) — distinção que exige consulta ao symbol indexer.
' A solução atual é usar `CType(expr, T)` diretamente, conforme já praticado
' nos projetos reais (vide docs/linguagem-basic/mod_card_grouper/).
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pValue As TObject)
         Dim record As CardRecord = CType(pValue, CardRecord)
         Print record.ToString()
      End Sub
   End Class
End Namespace
