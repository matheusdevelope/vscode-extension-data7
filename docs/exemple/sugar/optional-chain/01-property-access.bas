' @example: sugar/optional-chain/01-property-access
' @demonstrates: ?. em property access — vira If obj <> NULL Then ...
' @diagnostics: none
' @transpiled-to: sugar/optional-chain/_expected/01-property-access.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pObj As TPessoa)
         Dim nome As String = pObj?.Nome
         Print nome
      End Sub
   End Class
End Namespace
