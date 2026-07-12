' @example: sugar/array-list/03-four-stage-chain
' @demonstrates: cadeia Filter → Map → Map → Reduce com mutação de tipo (mod_exemplo_encadeamento)
' @diagnostics: none
'
Imports mod_tlist

Namespace mod_exemplo_encadeamento
   Class PecaMoto
      Private _nome As String
      Private _preco As Double

      Sub New(nome As String, preco As Double)
         MyBase.New()
         me._nome = nome
         me._preco = preco
      End Sub

      Function GetNome() As String
         GetNome = me._nome
      End Function

      Function GetPreco() As Double
         GetPreco = me._preco
      End Function

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class OrdemServico
      Private _descricao As String
      Private _custoTotal As Double

      Sub New(descricao As String, tempoMinutos As Integer, custoTotal As Double)
         MyBase.New()
         me._descricao = descricao
         me._custoTotal = custoTotal
      End Sub

      Function GetDescricao() As String
         GetDescricao = me._descricao
      End Function

      Function GetCustoTotal() As Double
         GetCustoTotal = me._custoTotal
      End Function

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Sub ProcessarUpgradesCG125()
      Dim carrinhoPecas[] As PecaMoto = [
         New PecaMoto("Kit Carenagem", 250.0),
         New PecaMoto("Haste do Freio", 25.0)
      ]

      Dim relatorioFinal As String = carrinhoPecas. _
         Filter(
            Function(pItem As PecaMoto) As Boolean
               Return pItem.GetPreco() >= 25.0
            End Function
         ). _
         Map<OrdemServico>(
            Function(pItem As PecaMoto, pIdx As Integer) As OrdemServico
               Return New OrdemServico("Instalação de " & pItem.GetNome(), 45, pItem.GetPreco() + 60.0)
            End Function
         ). _
         Map<String>(
            Function(sItem As OrdemServico, pIdx As Integer) As String
               Return "[" & CStr(pIdx + 1) & "] " & sItem.GetDescricao() & " -> R$ " & CStr(sItem.GetCustoTotal())
            End Function
         ). _
         Reduce<String>(
            Function(pAcumulador As String, linhaTexto As String) As String
               Return pAcumulador & Char(13) & linhaTexto
            End Function,
            "=== RELATÓRIO ==="
         )
   End Sub
End Namespace
