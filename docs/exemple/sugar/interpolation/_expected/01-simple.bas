' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/interpolation/01-simple. NÃO é compilado pelo Builder
' (não vive em src/), serve apenas como referência da expansão esperada.
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim nome As String
         nome = "Mundo"
         Dim s As String
         s = "Olá, " & (nome) & "!"
      End Sub
   End Class
End Namespace
