' @example: sugar/spread-object/01-basic
' @demonstrates: convenção atual usando .Assign() para spread em object init
' @diagnostics: none
'
' Spread em object initializer (`New TFoo() With { ...other, .X = 1 }`) ainda
' não é transpilado. A convenção atual em código real é usar .Assign() da
' cadeia TPersistent + atribuir os overrides manualmente:
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pOther As TPessoa)
         Dim p As New TPessoa()
         p.Assign(pOther)
         p.Idade = 30
      End Sub
   End Class
End Namespace
