' @example: diagnostics/default-indexer-missing/trigger
' @demonstrates: list(i) usado mas o tipo não declara Item(Integer)
' @diagnostics: default-indexer-missing@5
' @requires: classe TBag sem Property Item(Integer) no workspace
'
Namespace mod_demo
   Sub Run(pBag As TBag)
      Dim v = pBag(0)
   End Sub
End Namespace
