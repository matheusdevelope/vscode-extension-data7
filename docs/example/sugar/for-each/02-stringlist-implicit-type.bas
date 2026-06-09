' @example: sugar/for-each/02-stringlist-implicit-type
' @demonstrates: For Each sem "As Tipo" — o transpilador infere String pelo indexer Strings(i) do StringList
' @diagnostics: none
' @transpiled-to: sugar/for-each/_expected/02-stringlist-implicit-type.bas
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim list As StringList
         For Each item In list
            ' "item" é inferido como String porque Strings(i) retorna String
         Next
      End Sub
   End Class
End Namespace
