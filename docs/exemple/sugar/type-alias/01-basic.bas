' @example: sugar/type-alias/01-basic
' @demonstrates: Type ProductId = String — alias só design-time
' @diagnostics: none
'
' O `Type X = Y` é um alias só conhecido pelo linter — o Builder o apaga
' antes de gerar o .7Proj. Em runtime `ProductId` é tratado como `String`.
'
Namespace mod_demo

   Type ProductId = String
   Type Quantidade = Integer

   Class TDemo
      Public Sub Run(pId As ProductId, pQtd As Quantidade)
         Print pId & " " & pQtd
      End Sub
   End Class

End Namespace
