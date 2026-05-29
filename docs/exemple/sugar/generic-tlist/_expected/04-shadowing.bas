' @example: sugar/generic-tlist/04-shadowing
' @demonstrates: Bug 1 — variavel local nomeada `T` dentro do template NAO e
'                substituida pelo argumento de tipo; comentarios e strings
'                com a letra T ficam intactos. So referencias em posicao de
'                tipo (apos `As`, `New`, `Inherits`, dentro de `<...>`) sao
'                reescritas.
' @diagnostics: none
' @transpiled-to: sugar/generic-tlist/_expected/04-shadowing.bas
'
Namespace mod_demo


   Class TDemo
      Public Sub Run()
         Dim _products As TList_Product
         _products.Add(New Product())
      End Sub
   End Class

   Class TList_Product
      Public Count As Integer

      ' Comentario que menciona T deve ficar exato apos a monomorfizacao.
      Sub Add(pValue As Product)
         Dim T As String = "valor de T"
         me.Count = me.Count + 1
      End Sub
   End Class
End Namespace
